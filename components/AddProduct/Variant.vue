<script setup lang="ts">
const colors = ref([]);
const sizes = ref([]);

function addColor() {
    colors.value.push({ name: '' });
}

function deleteColor(index: number) {
    colors.value.splice(index, 1);
}

function addSize() {
    sizes.value.push({ name: '' });
}

function deleteSize(index: number) {
    sizes.value.splice(index, 1);
}

const emit = defineEmits(['update']);

watchEffect(() => {
    emit('update', { colors: colors.value, sizes: sizes.value });
});
</script>

<template id="variants">
    <div class="mb-10">
        <div class="text-xl mb-4">Variants</div>
        <hr class="h-px my-8 bg-gray-200 border-0 dark:bg-gray-700" />
        <div
            v-for="(color, index) in colors"
            :key="index"
            class="mt-2 mb-5 grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-6"
        >
            <div class="sm:col-span-2">
                <label
                    :for="'color' + index"
                    class="block text-sm font-medium leading-6 text-white"
                    >Color {{ index + 1 }}</label
                >
                <div class="mt-2">
                    <input
                        :id="'color' + index"
                        v-model="color.name"
                        :name="'color' + index"
                        type="color"
                        class="block w-full h-9 p-2 rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-orange-400 sm:text-sm sm:leading-6"
                    />
                </div>
            </div>

            <div class="sm:col-span-1 mt-8 flex justify-center items-center">
                <!-- Button to delete this variant -->
                <button
                    type="button"
                    class="rounded-md me-3 h-9 dark:text-gray-900 bg-red-500 hover:bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm"
                    @click="deleteColor(index)"
                >
                    Delete
                </button>
            </div>
        </div>
        <div class="">
            <button
                type="button"
                class="rounded-md mt-2 me-3 h-10 dark:text-gray-900 bg-primary-400 hover:bg-primary-500 px-3 py-2 text-sm font-semibold text-white shadow-sm"
                @click="addColor"
            >
                Add colors
            </button>
        </div>
    </div>

    <hr class="h-px my-8 bg-gray-200 border-0 dark:bg-gray-700" />

    <div class="mb-10">
        <div
            v-for="(size, index) in sizes"
            :key="index"
            class="mt-2 mb-5 grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-6"
        >
            <div class="sm:col-span-2">
                <label
                    :for="'size' + index"
                    class="block text-sm font-medium leading-6 text-white"
                    >Size {{ index + 1 }}</label
                >
                <div class="mt-2">
                    <input
                        :id="'size' + index"
                        v-model="size.name"
                        :name="'size' + index"
                        class="block w-full p-2 rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-orange-400 sm:text-sm sm:leading-6"
                    />
                </div>
            </div>

            <div class="sm:col-span-1 mt-8 flex justify-center items-center">
                <!-- Button to delete this variant -->
                <button
                    type="button"
                    class="rounded-md me-3 h-9 dark:text-gray-900 bg-red-500 hover:bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm"
                    @click="deleteSize(index)"
                >
                    Delete
                </button>
            </div>
        </div>
        <div class="">
            <button
                type="button"
                class="rounded-md mt-2 me-3 h-10 dark:text-gray-900 bg-primary-400 hover:bg-primary-500 px-3 py-2 text-sm font-semibold text-white shadow-sm"
                @click="addSize"
            >
                Add sizes
            </button>
        </div>
    </div>
</template>
