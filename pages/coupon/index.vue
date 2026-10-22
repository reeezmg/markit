<script setup lang="ts">
import { ref } from 'vue';
import CouponForm from '~/components/Coupon/CouponForm.vue';
import CouponList from '~/components/Coupon/CouponList.vue';
import CouponDetail from '~/components/Coupon/CouponDetail.vue';
import { useCreateCoupon, useUpdateCoupon, useDeleteCoupon } from '~/lib/hooks/coupon';
const companyScope = useCompanyScope('table');

const createCoupon = useCreateCoupon({ optimisticUpdate: true });
const updateCoupon = useUpdateCoupon({ optimisticUpdate: true });
const deleteCoupon = useDeleteCoupon({ optimisticUpdate: true });
const toast = useToast();

// ─── Selected coupon detail panel ───
const selectedCoupon = ref<any>(null)

const selectCoupon = (row: any) => {
    selectedCoupon.value = row
}

const closeDetail = () => {
    selectedCoupon.value = null
}

const addCoupon = async (coupon: any) => {
    try {
        await createCoupon.mutateAsync({
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
                        id: coupon.companyId,
                    },
                },
            },
        });
        toast.add({ title: 'Coupon created successfully!', color: 'green' });
        return true;
    } catch(error: any) {
        toast.add({
            title: 'Error creating coupon',
            description: error.message,
            color: 'red',
        });
        return false;
    }
};

const editCoupon = async (id: string, editCoupon: any) => {
    try {
        await updateCoupon.mutateAsync({
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
                targetType: editCoupon.targetType,
                startDate: new Date(editCoupon.startDate).toISOString(),
                endDate: new Date(editCoupon.endDate).toISOString(),
                usageLimit: editCoupon.usageLimit,
                perClientLimit: editCoupon.perClientLimit,
                isActive: editCoupon.isActive,
                isBillCombine: editCoupon.isBillCombine,
            },
        });
        if (selectedCoupon.value?.id === id) selectedCoupon.value = { ...selectedCoupon.value, ...editCoupon };

        toast.add({
            title: `Coupon updated successfully!`,
            color: 'green',
        });
        return true;
    } catch(error: any) {
        toast.add({
            title: 'Error updating coupon',
            description: error.message,
            color: 'red',
        });
        return false;
    }
};

const deleteCouponRow = async (id: string) => {
    try {
        await deleteCoupon.mutateAsync({
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
    } catch(error: any) {
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

const saving = ref(false);
const saveCoupon = async (form: any) => {
    if (saving.value) return;
    saving.value = true;
    try {
        let saved: boolean;
        if (editingCoupon.value) {
            saved = await editCoupon(editingCoupon.value.id, form);
        } else {
            saved = await addCoupon(form);
        }
        if (saved) closeForm();
    } catch(error: any) {
        toast.add({
            title: 'Error saving coupon',
            description: error.message,
            color: 'red',
        });
    } finally {
        saving.value = false;
    }
};
</script>

<template>
    <UDashboardPanelContent class="pb-24 p-4">
        <CompanyTableFilter />
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
                v-if="showForm"
                :coupon="editingCoupon"
                :saving="saving"
                @save="saveCoupon"
                @cancel="closeForm"
            />
        </UModal>
    </UDashboardPanelContent>
</template>
