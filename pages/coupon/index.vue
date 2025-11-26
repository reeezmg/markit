<script setup lang="ts">
import { ref } from 'vue';
import CouponForm from '~/components/Coupon/CouponForm.vue';
import CouponList from '~/components/Coupon/CouponList.vue';
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

const addCoupon = (coupon: any) => {
    console.log(coupon)
    try {
        createCoupon.mutate({
            data: {
                code: coupon.code,
                type: coupon.type,
                discountValue: coupon.discountValue,
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

        // Send notification if needed
        // $fetch('/api/notifications/notify', {
        //     method: 'POST',
        //     body: {
        //         userId: useAuth().session.value?.id,
        //         type: 'COUPON',
        //         Note: `Coupon ${coupon.code} created`,
        //         companyId: useAuth().session.value?.companyId,
        //         code: coupon.code,
        //         discount: coupon.discountValue,
        //         type: coupon.type
        //     }
        // });

    } catch(error) {
        console.log(error);
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
    } catch(error) {
        toast.add({
            title: 'Error while deleting the coupon',
            description: error.message,
            color: 'red',
        });
    }
};

const showForm = ref(false);
const selectedCoupon = ref<any | null>(null);

const openForm = (coupon = null) => {
    selectedCoupon.value = coupon;
    showForm.value = true;
    console.log(coupon);
};

const closeForm = () => {
    showForm.value = false;
    selectedCoupon.value = null;
};

const saveCoupon = (form: any) => {
    try {
        if (selectedCoupon.value) {
            editCoupon(selectedCoupon.value.id, form);
        } else {
            addCoupon(form);
        }
    } catch(error) {
        console.log(error);
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
    <UDashboardPanelContent class="pb-24">
        <div>
            <CouponList 
                @edit="openForm" 
                @delete="deleteCouponRow"  
                @open="openForm"
            />

            <UModal v-model="showForm">
                <CouponForm
                    :coupon="selectedCoupon"
                    @save="saveCoupon"
                    @cancel="closeForm"
                />
            </UModal>
        </div>
    </UDashboardPanelContent>
</template>