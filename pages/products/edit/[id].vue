<script setup lang="ts">
import AwsService from '~/composables/aws';
import { useUpdateProduct, useFindUniqueProduct } from '~/lib/hooks';

definePageMeta({
    auth: true,
});

const useAuth = () => useNuxtApp().$auth;

const route = useRoute();
const productId: string = route.params.id[0];
const router = useRouter();
const toast = useToast();
const UpdateProduct = useUpdateProduct();
const awsService = new AwsService();
interface ImageData {
    file: File;
    uuid: string;
}
interface Item {
    name: string;
}

const { data: product } = useFindUniqueProduct({
    where: {
        id: route.params.id[0],
        companyId: useAuth().session.value?.companyId,
    },
    include: {
        categories: {
            include: {
                category: true,
            },
        },
    },
});

const linkList = ['Create', 'Media', 'Live'];

const name = ref('');
const price = ref(0);
const description = ref('');
const colors = ref<Item[]>([]);
const sizes = ref<Item[]>([]);
const live = ref<boolean>();
let files = reactive<ImageData[]>([]);
const category = ref([]);

const createValue = (data: any) => {
    name.value = data.name;
    price.value = data.price;
    description.value = data.description;
    category.value = data.category;
};

const variantValue = (data: any) => {
    colors.value = data.colors;
    sizes.value = data.sizes;
};

const liveValue = (data: any) => {
    live.value = data.live;
};

const fileValue = (data: any) => {
    files = data.value;
};

const handleSubmit = async (e: Event) => {
    e.preventDefault();
    try {
        const res = UpdateProduct.mutateAsync({
            where: {
                id: productId,
            },
            data: {
                name: name.value || '',
                price: price.value || 0,
                description: description.value || '',
                status: live.value || undefined,
                colors: colors.value.map((color) => color.name),
                sizes: sizes.value.map((size) => size.name),
                images: files.map((file) => file.uuid),
                categories: {
                    upsert: category.value.map((categoryId) => ({
                        where: {
                            categoryId_productId: {
                                productId: productId,
                                categoryId: categoryId,
                            },
                        },
                        update: {}, // No need to update fields here, just ensure the relationship exists
                        create: {
                            productId: productId,
                            categoryId: categoryId,
                        },
                    })),
                },
            },
        });
        const base64files = await Promise.all(
            files
                .filter((file) => file.file !== undefined)
                .map(async (file) => {
                    const base64 = await prepareFileForApi(file.file);
                    return { base64, uuid: file.uuid };
                }),
        );

        if (base64files) {
            const [awsres, dbres] = await Promise.all([
                base64files.map((file) =>
                    awsService.uploadBase64File(file.base64, file.uuid),
                ),
                res,
            ]);
            toast.add({
                title: 'Product edited !',
                id: 'modal-success',
            });
            router.push(`/products`);
        }
    } catch (err: any) {
        console.log(err.info?.message ?? err);
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
            <div class="w-1/4">
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

            <div class="flex flex-col w-3/4">
                <UPageCard class="m-3" id="Create">
                    <AddProductCreate
                        :editName="product?.name"
                        :editPrice="product?.price"
                        :editDescription="product?.description"
                        :editCategory="
                            product?.categories.map((item) => item.category)
                        "
                        @update="createValue"
                    />
                </UPageCard>

                <UPageCard class="m-3" id="Media">
                    <AddProductMedia
                        :editFile="product?.images"
                        @update="fileValue"
                    />
                </UPageCard>

                <UPageCard class="m-3" id="Live">
                    <AddProductLive @update="liveValue" />
                </UPageCard>

                <div class="mt-5">
                    <button
                        class="rounded-md me-3 dark:text-gray-900 bg-primary-400 hover:bg-primary-500 px-3 py-2 text-sm font-semibold text-white shadow-sm"
                        @click="handleSubmit"
                    >
                        Finish
                    </button>
                </div>
            </div>
        </div>
    </UDashboardPanelContent>
</template>
