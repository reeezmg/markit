<script setup lang="ts">
import AwsService from '~/composables/aws';
import { useCreateCategory } from '~/lib/hooks';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const categoryStore = useCategoryStore()
const CreateCategory = useCreateCategory();
const awsService = new AwsService();
const useAuth = () => useNuxtApp().$auth;
interface ImageData {
    file: File;
    uuid: string;
}
interface Item {
    name: string;
}

interface Category {
    id:number;
    name: string;
    shortCut?: string;
    hsn: string;
    description: string;
    files: ImageData | null;
}

const linkList = ['Create', 'live'];

const name = ref('');
const hsn = ref('');
const shortCut = ref('');
const description = ref('');
const taxType = ref<"FIXED" | "VARIABLE"| undefined >(undefined);
const fixedTax = ref(0);
const thresholdAmount = ref(0);
const taxBelowThreshold = ref(0);
const taxAboveThreshold = ref(0);
const isLoading = ref(false);

const live = ref<boolean>();
let files = ref<ImageData | null>(null);
const subcategory = ref<Category[]>([]);
const subcategoryCounter = ref(1);

const createValue = (data: any) => {
    name.value = data.name;
    hsn.value = data.hsn;
    shortCut.value = data.shortCut;
    files.value = data.file;
    description.value = data.description;
    taxType.value = data.taxType;
    fixedTax.value = data.fixedTax;
    thresholdAmount.value = data.thresholdAmount;
    taxBelowThreshold.value = data.taxBelowThreshold;
    taxAboveThreshold.value = data.taxAboveThreshold;

};

const subcategoryValue = ( index:number,data: Category) => {
  
    subcategory.value[index] = data;

};





const liveValue = (data: any) => {
    live.value = data.live;
};

const handleAddSubCategory = () => {
    subcategory.value.push({
        id: subcategoryCounter.value++, // Increment and assign ID
        name: '',
        hsn: '',
        files: null,
        description: '',
        shortCut: ''
    });
};

const handleDeleteSubCategory = (index: number) => {
    subcategory.value.splice(index, 1);
};

const handleSubmit = async (e: Event) => {
    isLoading.value = true;
 console.log(subcategory.value)
    e.preventDefault();
    try {
        const res = await CreateCategory.mutateAsync({
    data: {
        name: name.value || '',
        hsn: hsn.value || '',
        description: description.value || '',
        status: live.value || undefined,
        ...(shortCut.value && { shortCut: shortCut.value }),
        image: files.value?.uuid,
        taxType: taxType.value || undefined,
        fixedTax: fixedTax.value || undefined,
        thresholdAmount: thresholdAmount.value || undefined,
        taxBelowThreshold: taxBelowThreshold.value || undefined,
        taxAboveThreshold: taxAboveThreshold.value || undefined,
        company: {
            connect: {
                id: useAuth().session.value?.companyId,
            },
        },
        subcategories: {
            create: subcategory.value.map((sub) => ({
                name: sub.name,
                description: sub.description ?? '',
                image: sub.files?.uuid ?? null,
                company: {
                    connect: {
                        id: useAuth().session.value?.companyId,
                    },
                },
            })),
        }
    },
});
        if (files.value) {
            const base64 = await prepareFileForApi(files.value.file);
            const base64file = { base64, uuid: files.value.uuid };

            console.log(base64file);

            const [awsres, dbres] = await Promise.all([
                awsService.uploadBase64File(base64file.base64, base64file.uuid),
                res,
            ]);
}
        toast.add({
            title: 'Category added !',
            id: 'modal-success',
        });
        await categoryStore.refreshCategories();
         console.log('All Categories:', categoryStore.categories)
        router.push(
            `/products/categories`,
        );
    } catch (err: any) {
        alert(err.info?.message ?? err);
        console.log(err)
    } finally {
        isLoading.value = false;
    }
};

const scrollToSection = (sectionId: string) => {
    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
    }
};
</script>

<template>
    <UDashboardPanelContent class="pb-24">
        <div class="flex flex-row">
            <div class="w-1/4 sm:block hidden">
                <UPageCard class="m-3">
                    <div class="text-lg"> Quick Links</div>
                    <div v-for="item in linkList" :key="item">
                        <hr
                            class="h-px my-6 bg-gray-200 border-0 dark:bg-gray-700"
                        />
                        <ULink
                            :to="'#' + item"
                            @click="scrollToSection(item)"
                            active-class="text-primary"
                            inactive-class="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                        >
                            {{ item }}
                        </ULink>
                    </div>
                </UPageCard>
            </div>

            <div class="flex flex-col sm:w-3/4 w-full">
                <UPageCard class="m-3" id="Create">
                    <AddCategoryCreate @update="createValue" />
                </UPageCard>

                <!-- Force re-render by binding a unique key to the parent div -->
                <UPageCard class="m-3" id="Subcategories">
          <div class="text-xl mb-4">Subcategories</div>
          
                    <div v-for="(subcat, index) in subcategory" :key="subcat.id">
                        <AddCategorySubcategory 
                        :index="index"
                        :id="subcat.id"
                        @update=" subcategoryValue(index, $event)"
                        />
                        <div class="mt-4 w-full text-end">
                        <UButton
                            label="Delete"
                            trailing-icon="i-heroicons-x-mark"
                            size="sm"
                            color="red"
                            @click="handleDeleteSubCategory(index)"
                        />
                        </div>
                        <hr class="h-px my-6 bg-gray-200 border-0 dark:bg-gray-700" />
                    </div>

                    <UButton
                        label="Add Subcategory"
                        trailing-icon="i-heroicons-plus"
                        size="sm"
                        color="primary"
                        block
                        @click="handleAddSubCategory"
                    />
                    </UPageCard>

                <div class="mt-5 text-end">
                    <UButton
                        class="rounded-md me-3 dark:text-gray-900 bg-primary-400 hover:bg-primary-500 px-3 py-2 text-sm font-semibold text-white shadow-sm w-40"
                        @click="handleSubmit"
                        :loading="isLoading"
                    >
                        Finish
                    </UButton>
                </div>
            </div>
        </div>
    </UDashboardPanelContent>
</template>