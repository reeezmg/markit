<script setup lang="ts">
import {
    useFindManyCoupon,
    useCreateCoupon,
    useUpdateCoupon,
} from '~/lib/hooks';
import type { Prisma } from '@prisma/client'

const props = defineProps({
    coupon: {
        type: Object,
        required: false
    }
});

const emit = defineEmits(['save', 'cancel']);
const toast = useToast();
const createCoupon = useCreateCoupon({ optimisticUpdate: true });
const updateCoupon = useUpdateCoupon({ optimisticUpdate: true });
const useAuth = () => useNuxtApp().$auth;

const isActiveOptions = [
    { label: 'Active', value: true },
    { label: 'Inactive', value: false }
]
const isBillCombineOptions = [
    { label: 'true', value: true },
    { label: 'false', value: false }
]
const audienceTypeOptions =[
    { label: 'All', value: 'ALL' },
    { label: 'Generate', value: 'GENERATE' },
    { label: 'Specific', value: 'SPECIFIC' },
]
const targetTypeOptions =[
    { label: 'All Products', value: 'ALL' },
    { label: 'Specific Categories', value: 'CATEGORY' },
    { label: 'Specific Products', value: 'PRODUCT' },
]
const typeOptions =[
    { label: 'Percentage', value: 'PERCENTAGE' },
    { label: 'Flat Amount', value: 'FLAT' },
    { label: 'Gift', value: 'GIFT' }
]

// ✅ Form Initialization with coupon data
const couponData = computed(() => ({
  code: props.coupon?.code || '',
  type: typeOptions.find(opt => opt.value === props.coupon?.type) || typeOptions[0],
  discountValue: props.coupon?.discountValue || '',
  maxDiscountAmount: props.coupon?.maxDiscountAmount || '',
  minBillAmount: props.coupon?.minBillAmount || '',
  minOrderValue: props.coupon?.minOrderValue || '',
  targetType: targetTypeOptions.find(opt => opt.value === props.coupon?.targetType)  || targetTypeOptions[0],
  audienceType: audienceTypeOptions.find(opt => opt.value === props.coupon?.audienceType)  || audienceTypeOptions[0],
  startDate: props.coupon?.startDate 
    ? new Date(props.coupon.startDate).toLocaleDateString('en-CA')
    : new Date().toLocaleDateString('en-CA'),
  endDate: props.coupon?.endDate 
    ? new Date(props.coupon.endDate).toLocaleDateString('en-CA')
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA'), // 30 days from now
  usageLimit: props.coupon?.usageLimit || '',
  perClientLimit: props.coupon?.perClientLimit || '',
  isActive: isActiveOptions.find(opt => opt.value === props.coupon?.isActive)  || isActiveOptions[0],
  isBillCombine: isBillCombineOptions.find(opt => opt.value === props.coupon?.isBillCombine)  || isBillCombineOptions[1],
}));

const form = ref({ ...couponData.value });

// Fetch existing coupons for code validation
const queryArgs = computed<Prisma.CouponFindManyArgs>(() => ({
    where: {
        companyId: useAuth().session.value?.companyId,
    },
    select: {
        id: true,
        code: true
    }
}));

const { data: existingCoupons, isLoading, error, refetch } = useFindManyCoupon(queryArgs);

const isCodeUnique = (code: string) => {
  if (!code) return true;
  if (props.coupon?.code === code) return true; // Same coupon editing
  return !existingCoupons.value?.some(coupon => coupon.code === code);
};

const saveForm = async () => {
    // Validation
    if (!form.value.code.trim()) {
        toast.add({
            title: 'Please enter a coupon code!',
            color: 'red',
        });
        return;
    }

    if (!isCodeUnique(form.value.code)) {
        toast.add({
            title: 'Coupon code already exists!',
            description: 'Please use a unique coupon code.',
            color: 'red',
        });
        return;
    }

    if ((!form.value.discountValue || parseFloat(form.value.discountValue) <= 0) && form.value.type.value !== 'GIFT') {
        toast.add({
            title: 'Please enter a valid discount value!',
            color: 'red',
        });
        return;
    }

    if (form.value.type.value === 'PERCENTAGE' && parseFloat(form.value.discountValue) > 100) {
        toast.add({
            title: 'Percentage discount cannot exceed 100%!',
            color: 'red',
        });
        return;
    }

    const startDate = new Date(form.value.startDate);
    const endDate = new Date(form.value.endDate);
    
    if (endDate <= startDate) {
        toast.add({
            title: 'End date must be after start date!',
            color: 'red',
        });
        return;
    }

    // Prepare data for emission
    const couponData = {
        ...form.value,
        discountValue: parseFloat(form.value.discountValue),
        maxDiscountAmount: form.value.maxDiscountAmount ? parseFloat(form.value.maxDiscountAmount) : null,
        minBillAmount: form.value.minBillAmount ? parseFloat(form.value.minBillAmount) : null,
        minOrderValue: form.value.minOrderValue ? parseFloat(form.value.minOrderValue) : null,
        usageLimit: form.value.usageLimit ? parseInt(form.value.usageLimit) : null,
        perClientLimit: form.value.perClientLimit ? parseInt(form.value.perClientLimit) : null,
        startDate: startDate,
        endDate: endDate,
        type: form.value.type.value,
        targetType: form.value.targetType.value,
        audienceType: form.value.audienceType.value,
        isActive: form.value.isActive.value,
        isBillCombine: form.value.isBillCombine.value,


    };

    emit('save', couponData);
};

// Watch for type changes to reset max discount for flat coupons
watch(() => form.value.type, (newType) => {
    if (newType.value === 'FLAT') {
        form.value.maxDiscountAmount = '';
    }
});

// Computed properties for dynamic UI
const showMaxDiscount = computed(() => form.value.type.value === 'PERCENTAGE');
const isCouponTypeGift = computed(() => form.value.type.value === 'GIFT');

const showGenerateField = computed(() => form.value.audienceType.value === 'GENERATE');

</script>

<template>
  <UCard class="p-6">
   <UForm :state="form" @submit="saveForm">
  <div class="grid grid-cols-2 gap-4">

    <!-- 🔹 Basic Details -->
    <div class="col-span-2">
      <h3 class="text-lg font-semibold mb-2">Basic Details</h3>
      <div class="grid grid-cols-2 gap-4">
        <UFormGroup label="Coupon Code" required>
          <UInput 
            v-model="form.code" 
            placeholder="e.g., SUMMER25" 
            :disabled="!!coupon?.code"
          />
        </UFormGroup>

        <UFormGroup label="Coupon Type" required>
          <USelectMenu v-model="form.type" :options="typeOptions" />
        </UFormGroup>

        <UFormGroup label="Coupon Audience" required>
          <USelectMenu v-model="form.audienceType" :options="audienceTypeOptions" />
        </UFormGroup>

         <UFormGroup label="Minimum Order Value">
          <UInput v-model="form.minOrderValue" type="number" placeholder="0.00" min="0" />
        </UFormGroup>
      </div>
    </div>

    <!-- 🔹 Generation Rules -->
    <div v-if="showGenerateField" class="col-span-2 mt-4">
      <h3 class="text-lg font-semibold mb-2">Generation Rules</h3>
      <div class="grid grid-cols-2 gap-4">

        <UFormGroup label="Combine Bill">
          <USelectMenu v-model="form.isBillCombine" :options="isBillCombineOptions" />
        </UFormGroup>

        <UFormGroup label="Minimum Bill Value">
          <UInput v-model="form.minBillAmount" type="number" placeholder="0.00" min="0" />
        </UFormGroup>
      </div>
    </div>

    <!-- 🔹 Discount Rules -->
    <div v-if="!isCouponTypeGift" class="col-span-2 mt-4">
      <h3 class="text-lg font-semibold mb-2">Discount Rules</h3>
      <div class="grid grid-cols-2 gap-4">
        <UFormGroup
          :label="form.type.value === 'PERCENTAGE' ? 'Discount Percentage' : 'Discount Amount'" 
          required>
          <UInput 
            v-model="form.discountValue" 
            type="number" 
            :placeholder="form.type.value === 'PERCENTAGE' ? '0-100' : '0.00'"
            :min="0"
            :max="form.type.value === 'PERCENTAGE' ? 100 : undefined"
          />
        </UFormGroup>

        <UFormGroup v-if="showMaxDiscount" label="Max Discount Amount">
          <UInput v-model="form.maxDiscountAmount" type="number" placeholder="0.00" min="0" />
        </UFormGroup>

      </div>
    </div>

    <!-- 🔹 Validity -->
    <div class="col-span-2 mt-4">
      <h3 class="text-lg font-semibold mb-2">Validity</h3>
      <div class="grid grid-cols-2 gap-4">
        <UFormGroup label="Start Date" required>
          <UInput v-model="form.startDate" type="date" />
        </UFormGroup>
        <UFormGroup label="End Date" required>
          <UInput v-model="form.endDate" type="date" />
        </UFormGroup>
      </div>
    </div>

    <!-- 🔹 Limits -->
    <div class="col-span-2 mt-4">
      <h3 class="text-lg font-semibold mb-2">Limits & Restrictions</h3>
      <div class="grid grid-cols-2 gap-4">
        <UFormGroup label="Total Usage Limit">
          <UInput v-model="form.usageLimit" type="number" placeholder="Unlimited" min="0" />
        </UFormGroup>
        <UFormGroup label="Per Client Limit">
          <UInput v-model="form.perClientLimit" type="number" placeholder="Unlimited" min="0" />
        </UFormGroup>
      </div>
    </div>

    <!-- 🔹 Status -->
    <div class="col-span-2 mt-4">
      <UFormGroup label="Status">
        <USelectMenu v-model="form.isActive" :options="isActiveOptions" />
      </UFormGroup>
    </div>
  </div>

  <!-- ✅ Buttons -->
  <div class="flex justify-end mt-6">
    <UButton color="gray" variant="solid" @click="emit('cancel')">Cancel</UButton>
    <UButton color="primary" variant="solid" class="ml-3" type="submit">
      {{ coupon ? 'Update' : 'Create' }} Coupon
    </UButton>
  </div>
</UForm>

  </UCard>
</template>