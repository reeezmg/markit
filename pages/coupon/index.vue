<script setup lang="ts">
import { ref } from 'vue';
import CouponForm from '~/components/Coupon/CouponForm.vue';
import CouponList from '~/components/Coupon/CouponList.vue';
import CouponDetail from '~/components/Coupon/CouponDetail.vue';
import {
    useCreateCoupon,
    useUpdateCoupon,
    useDeleteCoupon,
} from '~/lib/hooks';

const createCoupon = useCreateCoupon({ optimisticUpdate: true });
const updateCoupon = useUpdateCoupon({ optimisticUpdate: true });
const deleteCoupon = useDeleteCoupon({ optimisticUpdate: true });
const useAuth = () => useNuxtApp().$auth;
const toast = useToast();

// ─── Selected coupon detail panel ───
const selectedCoupon = ref<any>(null)

const selectCoupon = (row: any) => {
    selectedCoupon.value = row
}

const closeDetail = () => {
    selectedCoupon.value = null
}

const addCoupon = (coupon: any) => {
    try {
        createCoupon.mutate({
            data: {
                code: coupon.code,
                type: coupon.type,
                discountValue: coupon.discountValue,
                giftBarcode: coupon.giftBarcode,
                maxDiscountAmount: coupon.maxDiscountAmount,
                minOrderValue: coupon.minOrderValue,
                minBillAmount: coupon.minBillAmount,
                audienceType: coupon.audienceType,
                targetType: coupon.targetType,
                startDate: new Date(coupon.startDate).toISOString(),
                endDate: new Date(coupon.endDate).toISOString(),
                usageLimit: coupon.usageLimit,
                perClientLimit: coupon.perClientLimit,
                isActive: coupon.isActive,
                isBillCombine: coupon.isBillCombine,
                company: {
                    connect: {
                        id: useAuth().session.value?.companyId,
                    },
                },
            },
        });
    } catch(error) {
        toast.add({
            title: 'Error creating coupon',
            description: error.message,
            color: 'red',
        });
    }
};

const editCoupon = (id: string, editCoupon: any) => {
    try {
        updateCoupon.mutate({
            where: {
                id,
            },
            data: {
                code: editCoupon.code,
                type: editCoupon.type,
                discountValue: editCoupon.discountValue,
                giftBarcode: editCoupon.giftBarcode,
                maxDiscountAmount: editCoupon.maxDiscountAmount,
                minOrderValue: editCoupon.minOrderValue,
                minBillAmount: editCoupon.minBillAmount,
                audienceType: editCoupon.audienceType,
                startDate: new Date(editCoupon.startDate).toISOString(),
                endDate: new Date(editCoupon.endDate).toISOString(),
                usageLimit: editCoupon.usageLimit,
                perClientLimit: editCoupon.perClientLimit,
                isActive: editCoupon.isActive,
                isBillCombine: editCoupon.isBillCombine,
            },
        });

        toast.add({
            title: `Coupon updated successfully!`,
            color: 'green',
        });
    } catch(error) {
        toast.add({
            title: 'Error updating coupon',
            description: error.message,
            color: 'red',
        });
    }
};

const deleteCouponRow = (id: string) => {
    try {
        deleteCoupon.mutate({
            where: {
                id,
            },
        });
        toast.add({
            title: `Coupon deleted successfully!`,
            color: 'green',
        });
        if (selectedCoupon.value?.id === id) {
            selectedCoupon.value = null
        }
    } catch(error) {
        toast.add({
            title: 'Error while deleting the coupon',
            description: error.message,
            color: 'red',
        });
    }
};

const showForm = ref(false);
const editingCoupon = ref<any | null>(null);

const openForm = (coupon = null) => {
    editingCoupon.value = coupon;
    showForm.value = true;
};

const closeForm = () => {
    showForm.value = false;
    editingCoupon.value = null;
};

const saveCoupon = (form: any) => {
    try {
        if (editingCoupon.value) {
            editCoupon(editingCoupon.value.id, form);
        } else {
            addCoupon(form);
        }
    } catch(error) {
        toast.add({
            title: 'Error saving coupon',
            description: error.message,
            color: 'red',
        });
    } finally {
        closeForm();
    }
};
</script>

<template>
    <UDashboardPanelContent class="pb-24 p-4">
        <div class="flex border border-gray-200 dark:border-gray-700 rounded-md">
            <!-- Left: Coupon List -->
            <div
                :class="[
                    'flex flex-col border-r border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-300 ease-in-out',
                    selectedCoupon ? 'w-[30%] min-w-[300px]' : 'w-full'
                ]"
            >
                <CouponList
                    :selected-coupon="selectedCoupon"
                    @edit="openForm"
                    @delete="deleteCouponRow"
                    @open="openForm"
                    @select="selectCoupon"
                />
            </div>

            <!-- Right: Detail Panel -->
            <Transition
                enter-active-class="transition-all duration-300 ease-in-out"
                enter-from-class="opacity-0 translate-x-4"
                enter-to-class="opacity-100 translate-x-0"
                leave-active-class="transition-all duration-200 ease-in"
                leave-from-class="opacity-100 translate-x-0"
                leave-to-class="opacity-0 translate-x-4"
            >
                <CouponDetail
                    v-if="selectedCoupon"
                    :coupon="selectedCoupon"
                    @close="closeDetail"
                />
            </Transition>
        </div>

        <UModal v-model="showForm">
            <CouponForm
                :coupon="editingCoupon"
                @save="saveCoupon"
                @cancel="closeForm"
            />
        </UModal>
    </UDashboardPanelContent>
</template>
