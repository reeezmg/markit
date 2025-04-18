<script setup lang="ts">
import AwsService from '~/composables/aws';
import { useUpdateCategory, useFindUniqueCategory } from '~/lib/hooks';
definePageMeta({
    auth: true,
});
const route = useRoute();
const router = useRouter();
const toast = useToast();
const UpdateCategory = useUpdateCategory();
const awsService = new AwsService();
const useAuth = () => useNuxtApp().$auth;
interface ImageData {
    file: File;
    uuid: string;
}
interface Item {
    name: string;
}

const linkList = ['Create', 'live'];

const name = ref('');
const price = ref(0);
const description = ref('');
const colors = ref<Item[]>([]);
const sizes = ref<Item[]>([]);
const live = ref<boolean>();
let files = reactive<ImageData[]>([]);

const createValue = (data: any) => {
    name.value = data.name;
    files = data.file;
    description.value = data.description;
};

const liveValue = (data: any) => {
    live.value = data.live;
};

const { data: category }: any = useFindUniqueCategory({
    where: { id: route.params.id },
});

const handleSubmit = async (e: Event) => {
    console.log(files[0]);
    e.preventDefault();
    try {
        const res = UpdateCategory.mutateAsync({
            where: { id: route.params.id },
            data: {
                name: name.value || '',
                description: description.value || '',
                status: live.value || undefined,
                image: files[0].uuid,
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
            console.log(base64files);
            const [awsres, dbres] = await Promise.all([
                base64files.map((file) =>
                    awsService.uploadBase64File(file.base64, file.uuid),
                ),
                res,
            ]);
        }
        toast.add({
            title: 'Category edited !',
            id: 'modal-success',
        });
        router.push(
            `/products/categories`,
        );
    } catch (err: any) {
        alert(err.info?.message ?? err);
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
                    <AddCategoryCreate
                        @update="createValue"
                        :editName="category?.name"
                        :editDescription="category?.description"
                        :editFile="category?.image"
                    />
                </UPageCard>

                <UPageCard class="m-3" id="Live">
                    <AddCategoryLive @update="liveValue" />
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
