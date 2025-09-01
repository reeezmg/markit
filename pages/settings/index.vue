<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '#ui/types';
import { useFindUniqueUser, useUpdateUser,useFindUniqueCompanyUser,useUpdateCompanyUser } from '~/lib/hooks';
import { v4 as uuidv4 } from 'uuid';
import AwsService from '~/composables/aws';

interface ImageData {
    file: File;
    uuid: string;
}

const UpdateUser = useUpdateUser();
const UpdateCompanyUser = useUpdateCompanyUser();
const fileRef = ref<HTMLInputElement>();
const awsService = new AwsService();
const isDeleteAccountModalOpen = ref(false);
const useAuth = () => useNuxtApp().$auth;
const selectedFile = ref<ImageData | null>(null);
const showOtpInput = ref(false)
const isSendingOtp = ref(false);
const isVerifyingOtp = ref(false);
const isUpdatingProfile = ref(false);
const isUpdatingPassword = ref(false);
const isNameChanged = ref(false);
const isImageChanged = ref(false);
const isEmailChanged = ref(false);
const router = useRouter();


const toast = useToast();

const state = reactive({
    name: '',
    email:  '',
    image:  '',
    password_current: '',
    password_new: '',
    confirm_password: '',
    otp: '',
});



const { data: userData } = useFindUniqueUser({
    where: {
        id: useAuth().session.value?.id,
    },
    select: {
        id: true,
        email: true,
        image: true,
        password: true,
    },
}
);
const { data: companyUserData } = useFindUniqueCompanyUser({
     where: {
        companyId_userId: {
        companyId: useAuth().session.value?.companyId!,
        userId: useAuth().session.value?.id!,
        },
    },
    select: {
        name: true,
    },
}
);


watch(() => state.name, (newName) => {
  isNameChanged.value = newName !== companyUserData.value?.name;
}, { immediate: true });

watch(() => state.email, (newEmail) => {
  isEmailChanged.value = newEmail !== userData.value?.email;
}, { immediate: true });


watch(() => userData.value, (newVal) => {
  if (newVal) {
    state.email = newVal.email;
    state.image = newVal.image || '';
  }
},{ deep: true, immediate: true });

watch(() => companyUserData.value, (newVal) => {
  if (newVal) {
    state.name = newVal.name || '';
  }
},{ deep: true, immediate: true });



function onFileClick() {
    fileRef.value?.click();
}


const previewUrl = computed(() => {
  if (selectedFile.value?.file) {
    return URL.createObjectURL(selectedFile.value.file);
  }
  return null;
});


function handleAddImageChange(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    isImageChanged.value = true
    if (files && files.length > 0) {
        const file = files[0]; // Take only the first file
        const uuid = uuidv4();
        selectedFile.value = { file, uuid };
    }
}

const onProfileUpdate = async () => {
    try{
    await UpdateUser.mutateAsync({
        where: {
            id: useAuth().session.value?.id,
        },
        data: {
            ...(selectedFile.value?.file && {
                image: selectedFile.value?.uuid,
            }),
        }
    });

    await UpdateCompanyUser.mutateAsync({
        where: {
            companyId_userId: {
            companyId: useAuth().session.value?.companyId!,
            userId: useAuth().session.value?.id!,
            },
        },
        data: {
            name: state.name,
        },
        });


    
    if (selectedFile.value) {
        const base64 = await prepareFileForApi(selectedFile.value.file);
        const base64file = { base64, uuid: selectedFile.value.uuid };

        console.log(base64file);

        await awsService.uploadBase64File(base64file.base64, base64file.uuid);
    }

    await updateProfileDetails(state.name,null,selectedFile.value?.uuid)
}catch(error){
    console.error(error);
    toast.add({
        title: 'Error updating profile',
        icon: 'i-heroicons-exclamation-circle',
        color: 'red',
    });
}finally {
        isUpdatingProfile.value = false;
        toast.add({
            title: 'Profile updated successfully',
            icon: 'i-heroicons-check-circle',
            color: 'green',
        });
    }

};

const onPasswordUpdate = async () => {
    if (!state.password_current || !state.password_new || !state.confirm_password) {
        toast.add({
            title: 'All fields are required',
            icon: 'i-heroicons-exclamation-circle',
            color: 'red',
        });
        return;
    }

    isUpdatingPassword.value = true;


    if (state.password_new !== state.confirm_password) {
        toast.add({
            title: 'Passwords do not match',
            icon: 'i-heroicons-exclamation-circle',
            color: 'red',
        });
        return;
    }

    if (state.password_new.length < 6) {
        toast.add({
            title: 'Password must be at least 6 characters',
            icon: 'i-heroicons-exclamation-circle',
            color: 'red',
        });
        return;
    }

    try {
       const res = await authForgetPassword(state.password_current,state.password_new);

        toast.add({
            title: res.message,
            icon: 'i-heroicons-check-circle',
            color: 'green',
        });

        // Reset form fields
        state.password_current = '';
        state.password_new = '';
        state.confirm_password = '';
    } catch (error) {
        console.error(error);
        if (error.statusCode === 401) {
            toast.add({
                title:'Incorrect passworde',
                icon: 'i-heroicons-exclamation-circle',
                color: 'red',
            });
            return;
        }
        toast.add({
            title: 'Error updating password',
            icon: 'i-heroicons-exclamation-circle',
            color: 'red',
        });
    }finally {
        isUpdatingPassword.value = false;
    }
};

const onVerifyEmail = async () => {
    const { email } = state;
    if (!email) {
        toast.add({ title: 'Please enter your email', icon: 'i-heroicons-exclamation-circle', color: 'red' });
        return;
    }

    isSendingOtp.value = true;

    try {
        const res = await $fetch('/api/send-otp', {
            method: 'POST',
            body: { email },
        });

        toast.add({ title: res.message, icon: 'i-heroicons-check-circle', color: 'green' });
        showOtpInput.value = true;
    } catch (error: any) {
        console.error(error);
        toast.add({ title: 'Failed to send OTP', icon: 'i-heroicons-exclamation-circle', color: 'red' });
    }finally {
        isSendingOtp.value = false;
    }
};

const onVerifyOtp = async () => {
    if (!state.otp) {
        toast.add({ title: 'Please enter the OTP', icon: 'i-heroicons-exclamation-circle', color: 'red' });
        return;
    }
    isVerifyingOtp.value = true;

    try {
        const res = await $fetch('/api/verify-otp', {
            method: 'POST',
            body: {
                email: state.email,
                otp: state.otp,
            },
        });

        toast.add({ title: res.message, icon: 'i-heroicons-check-circle', color: 'green' });
        try{
            await UpdateUser.mutateAsync({
        where: {
            id: useAuth().session.value?.id,
        },
        data: {
            email: state.email,
        }
        });
         await updateProfileDetails(null,state.email,null)
        toast.add({ title: 'Email updated successfully', icon: 'i-heroicons-check-circle', color: 'green' });
        }catch(error){
            console.log(error)
        }
        showOtpInput.value = false;
        state.otp = '';
    } catch (error: any) {
        console.error(error);
        toast.add({ title: 'OTP verification failed', icon: 'i-heroicons-exclamation-circle', color: 'red' });
    }finally {
        isVerifyingOtp.value = false;
    }
};


</script>

<template>
    <UDashboardPanelContent class="pb-24">
        <UDashboardSection
            title="Theme"
            description="Customize the look and feel of your dashboard."
        >
            <template #links>
                <UColorModeButton color="primary" />
                <!-- <ColorPicker/> -->
            </template>
        </UDashboardSection>

        <UDivider class="mb-4" />

       

        <UFormGroup
            name="email"
            label="Email"
            description="Used to sign in, for email receipts and product updates."
            required
            class="grid grid-cols-2 gap-2"
            :ui="{ container: '' }"
        >
            <div class="flex items-center gap-2 w-full">
                <UInput
                    v-model="state.email"
                    type="email"
                    autocomplete="off"
                    icon="i-heroicons-envelope"
                    size="md"
                    class="flex-1"
                />
            </div>

                <UButton
                     v-if="!showOtpInput"
                    label="Verify Email"
                    size="md"
                    class="mt-4"
                    :disabled="!state.email || !isEmailChanged"
                     :loading="isSendingOtp"
                    @click="onVerifyEmail"
                />
        </UFormGroup>

        <UFormGroup
            v-if="showOtpInput"
            name="otp"
            label="Enter OTP"
            description="Check your email for the OTP"
            class="grid grid-cols-2 gap-2 mt-4"
            >
            <UInput
                v-model="state.otp"
                type="text"
                placeholder="Enter OTP"
                icon="i-heroicons-lock-closed"
            />
            <UButton
                label="Verify OTP"
                size="md"
                :loading="isVerifyingOtp"
                class="mt-2"
                @click="onVerifyOtp"
            />
            </UFormGroup>

        <UDivider class="my-4" />

              
                
                <UFormGroup
                    name="avatar"
                    label="Avatar"
                    class="grid grid-cols-2 gap-2"
                    help="JPG, GIF or PNG. 1MB Max."
                    :ui="{
                        container: 'flex flex-wrap items-center gap-3',
                        help: 'mt-0',
                    }"
                >
                    <UAvatar v-if="previewUrl" :src="previewUrl" :alt="state.name" size="lg" />
                    <UAvatar v-else :src="`https://images.markit.co.in/${state.image|| ''}`" :alt="state.name" size="lg" />

                    <UButton
                        label="Choose"
                        color="white"
                        size="md"
                        @click="onFileClick"
                    />

                    <input
                        ref="fileRef"
                        type="file"
                        class="hidden"
                        accept=".jpg, .jpeg, .png, .gif"
                        @change="handleAddImageChange"
                    />

                   
                </UFormGroup>

                <UFormGroup
                    name="name"
                    label="Name"
                    description="Will appear on receipts, invoices, and other communication."
                    required
                    class="grid grid-cols-2 gap-2 items-center mt-4"
                    :ui="{ container: '' }"
                >
                    <UInput
                        v-model="state.name"
                        autocomplete="off"
                        icon="i-heroicons-user"
                        size="md"
                    />

                    <UButton
                    label="Update Profile"
                    size="md"
                    class="mt-4"
                    :loading="isUpdatingProfile"
                    :disabled="!state.name || (!isNameChanged && !isImageChanged)"
                    @click="onProfileUpdate"
                />
                </UFormGroup>
                
               
               


                <UDivider class="my-4" />
                <UFormGroup
                    name="password"
                    label="Password"
                    description="Confirm your current password before setting a new one."
                    class="grid grid-cols-2 gap-2"
                    :ui="{ container: '' }"
                >
                    <UInput
                        id="password"
                        v-model="state.password_current"
                        type="password"
                        placeholder="Current password"
                        size="md"
                    />
                    <UInput
                        id="password_new"
                        v-model="state.password_new"
                        type="password"
                        placeholder="New password"
                        size="md"
                        class="mt-2"
                    />
                    <UInput
                        id="confirm_password"
                        v-model="state.confirm_password"
                        type="password"
                        placeholder="Confirm password"
                        size="md"
                        class="mt-2"
                    />

                    <UButton
                    label="Update Password"
                    size="md"
                    class="mt-4"
                    :loading="isUpdatingPassword"
                    :disabled="!state.password_current || !state.password_new || !state.confirm_password"
                    @click="onPasswordUpdate"
                />
                    
                </UFormGroup>

                
        <UDivider class="my-4" />
              
        <UDashboardSection
            title="Sales History"
        >
            <template #links>
                <UButton
                    label="Check"
                    size="md"
                   @click=" () => router.push(`./saleshistory`)"
                />
           </template>
        </UDashboardSection>

        <UDivider class="my-4" />

        <UDashboardSection
            title="Account"
            description="No longer want to use our service? You can delete your account here. This action is not reversible. All information related to this account will be deleted permanently."
        >
            <template #links>
                <UButton
                    color="red"
                    label="Delete account"
                    size="md"
                    @click="isDeleteAccountModalOpen = true"
                />
           </template>
        </UDashboardSection>
         <UDivider class="my-4" />

        <!-- ~/components/settings/DeleteAccountModal.vue -->
        <SettingsDeleteAccountModal v-model="isDeleteAccountModalOpen" />
    </UDashboardPanelContent>
</template>
