<script setup lang="ts">
import {
  useFindManyAddress,
  useCreateAddress,
  useUpdateAddress,
} from '~/lib/hooks';

const toast = useToast();
const emit = defineEmits(['update']);
const useClientAuth = () => useNuxtApp().$authClient;
const clientId = useClientAuth().session.value?.id;

const {
  data: allAddresses,
  refetch: refetchAddresses,
} = useFindManyAddress({
  where: { clientId },
});

const { mutateAsync: createAddress } = useCreateAddress();
const { mutateAsync: updateAddress } = useUpdateAddress();

const isNewAddress = ref(false);
const selectedAddressId = ref('');
const formData = reactive({
  name: '',
  street: '',
  locality: '',
  city: '',
  state: '',
  pincode: '',
});

const fields = [
  { name: 'name', label: 'House/Flat Details', placeholder: 'Enter your house or flat details' },
  { name: 'street', label: 'Street', placeholder: 'Enter your street address' },
  { name: 'locality', label: 'Locality', placeholder: 'Enter your locality' },
  { name: 'city', label: 'City', placeholder: 'Enter your city' },
  { name: 'state', label: 'State', placeholder: 'Enter your state' },
  { name: 'pincode', label: 'Pincode', placeholder: 'Enter your pincode' },
];

// Prefill with active address on load
watchEffect(() => {
  const active = allAddresses.value?.find(a => a.active);
  if (active) {
    selectedAddressId.value = active.id;
    Object.assign(formData, active); // 💡 Ensures formData is populated
    emit('update', active.id);
  }
});

// Watch selected option
watch(selectedAddressId, async (id) => {
  if (!id) return;

  const selected = allAddresses.value?.find(a => a.id === id);
  if (selected) {
    Object.assign(formData, selected);
    emit('update', id);

    // Switch active address
    try {
      const previousActive = allAddresses.value?.find(a => a.active);
      if (previousActive && previousActive.id !== id) {
        await updateAddress({
          where: { id: previousActive.id },
          data: { active: false },
        });
        await updateAddress({
          where: { id },
          data: { active: true },
        });
        await refetchAddresses();
        toast.add({ title: 'Address switched', color: 'green' });
      }
    } catch (error) {
      toast.add({
        title: 'Failed to switch address',
        description: error.message || '',
        color: 'red',
      });
    }
  }
});

const startNewAddress = () => {
  isNewAddress.value = true;
  selectedAddressId.value = '';
  Object.assign(formData, {
    name: '',
    street: '',
    locality: '',
    city: '',
    state: '',
    pincode: '',
  });
};

const saveAddress = async () => {
  if (!formData.name) {
    toast.add({ title: 'Name is required', color: 'red' });
    return;
  }
  console.log(formData)
  try {
    const previousActive = allAddresses.value?.find(a => a.active);
    if (previousActive) {
      await updateAddress({
        where: { id: previousActive.id },
        data: { active: false },
      });
    }

    const res = await createAddress({
      data: {
        ...formData,
        client: { connect: { id: clientId } },
        active: true,
      },
    });
    selectedAddressId.value = res.id;
    isNewAddress.value = false;
    await refetchAddresses();
    toast.add({ title: 'Address added successfully', color: 'green' });
  } catch (err) {
    toast.add({
      title: 'Failed to add address',
      description: err.message || '',
      color: 'red',
    });
  }
};

const cancelNewAddress = () => {
  isNewAddress.value = false;

  const active = allAddresses.value?.find(a => a.active);
  if (active) {
    selectedAddressId.value = active.id;
    Object.assign(formData, active);
  } else {
    selectedAddressId.value = '';
    Object.assign(formData, {
      name: '',
      street: '',
      locality: '',
      city: '',
      state: '',
      pincode: '',
    });
  }
};


</script>
<template>
  <div>
    <div class="mb-3 text-xl font-semibold">Contact Information</div>

    <UFormGroup v-if="!isNewAddress" label="Select Address" class="mb-3">
      <div class="flex items-center gap-2">
        <USelect
          v-model="selectedAddressId"
          :options="allAddresses?.map(a => ({
            label: `${a.name}, ${a.street}`,
            value: a.id,
          }))"
          placeholder="Choose existing address"
          class="flex-1"
        />
        <UButton
          @click="startNewAddress"
          icon="i-heroicons-plus"
          size="sm"
          color="gray"
          variant="outline"
        >
          Address
        </UButton>
      </div>
    </UFormGroup>

    <!-- If adding a new address, show form inputs -->
    <div v-if="isNewAddress">
      <UFormGroup
        v-for="field in fields"
        :key="field.name"
        :name="field.name"
        :label="field.label"
        class="mb-3"
      >
        <UInput
          v-model="formData[field.name]"
          :placeholder="field.placeholder"
          type="text"
        />
      </UFormGroup>

      <div class="flex justify-end mt-4 gap-2">
      <UButton @click="cancelNewAddress" variant="outline" color="gray">
        Cancel
      </UButton>
      <UButton @click="saveAddress" color="primary">
        Save Address
      </UButton>
    </div>
    </div>

    <!-- Otherwise, show read-only address display -->
    <div v-else-if="selectedAddressId" class="space-y-2 bg-gray-50 p-4 rounded-md border">
      <div><strong>Name:</strong> {{ formData.name }}</div>
      <div><strong>Street:</strong> {{ formData.street }}</div>
      <div><strong>Locality:</strong> {{ formData.locality }}</div>
      <div><strong>City:</strong> {{ formData.city }}</div>
      <div><strong>State:</strong> {{ formData.state }}</div>
      <div><strong>Pincode:</strong> {{ formData.pincode }}</div>
    </div>
  </div>
</template>
