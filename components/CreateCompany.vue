<script setup lang="ts">
import { useCreateCompany } from '~/lib/hooks';
const useAuth = () => useNuxtApp().$auth;
const CreateCompany = useCreateCompany();
const router = useRouter();
const props = defineProps<{
    isOpen: boolean;
}>();
const toast = useToast();
const emit = defineEmits(['update:isOpen']);

const internalIsOpen = ref(props.isOpen);
const name = ref();
const type = ref();
const options = [
    { label: 'Buyer', value: 'buyer' },
    { label: 'Seller', value: 'seller' },
];

watch(() => props.isOpen,(newVal) => {
        internalIsOpen.value = newVal;
    },
);

watch(internalIsOpen, (newVal) => {
    emit('update:isOpen', newVal);
});

const handleSubmit = async (e: Event) => {
    try {
        const res = await CreateCompany.mutateAsync({
            data: {
                name: name.value || '',
                type: type.value.value,
                users: {
                    create: {
                        user: {
                            connect: {
                                id: useAuth().session.value?.id,
                            },
                        },
                    },
                },
            },
        });

        await updateCompanySession(res?.id, res?.type, res?.name);
        toast.add({
            title: 'Company added !',
            id: 'modal-success',
        });
        router.push(`/}`);
        internalIsOpen.value = false;
    } catch (err: any) {
        console.log(err.info?.message ?? err);
    }
};
</script>

<template>
    <div>
        <UModal v-model="internalIsOpen">
            <UCard
                :ui="{
                    ring: '',
                    divide: 'divide-y divide-gray-100 dark:divide-gray-800',
                }"
            >
                <template #header>
                    <div> Add company </div>
                </template>
                <UFormGroup name="name" label="Company name" class="mb-5">
                    <UInput
                        v-model="name"
                        type="text"
                        placeholder="Enter your company name"
                    />
                </UFormGroup>
                <UFormGroup name="selectMenu" label="Type" class="mb-5">
                    <USelectMenu
                        v-model="type"
                        placeholder="Select company type"
                        :options="options"
                    />
                </UFormGroup>

                <UButton type="submit" block class="mb-5" @click="handleSubmit">
                    Continue
                </UButton>
            </UCard>
        </UModal>
    </div>
</template>
