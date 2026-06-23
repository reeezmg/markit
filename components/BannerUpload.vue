<script setup lang="ts">
import { v4 as uuidv4 } from 'uuid';

interface ImageData {
  file?: File;
  uuid: string;
}

const props = defineProps<{
  editUuid?: string | null;
  label?: string;
  /** wide => banner aspect (h-32 w-full), square => image tile (h-40 w-40) */
  variant?: 'wide' | 'square';
}>();

const emit = defineEmits<{ (e: 'update', value: ImageData | null): void }>();

const selected = ref<ImageData | null>(null);
const previewUrl = ref<string | null>(null);

watchEffect(() => {
  // seed from existing uuid only while no new file picked
  if (props.editUuid && !selected.value?.file) {
    selected.value = { uuid: props.editUuid };
    previewUrl.value = `https://images.markit.co.in/${props.editUuid}`;
  }
});

function onChange(e: Event) {
  const files = (e.target as HTMLInputElement).files;
  if (!files || files.length === 0) return;
  const file = files[0];
  const uuid = uuidv4();
  selected.value = { file, uuid };
  const reader = new FileReader();
  reader.onload = () => {
    previewUrl.value = reader.result as string;
  };
  reader.readAsDataURL(file);
  emit('update', selected.value);
}

const boxClass = computed(() =>
  props.variant === 'square'
    ? 'h-40 w-full sm:w-40'
    : 'h-32 w-full',
);
</script>

<template>
  <div class="shrink-0">
    <div class="block text-sm font-medium leading-6 dark:text-white mb-1">
      {{ label || 'Banner' }}
    </div>
    <label class="block cursor-pointer">
      <div
        v-if="previewUrl"
        class="flex items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900"
        :class="boxClass"
      >
        <img :src="previewUrl" alt="preview" class="h-full w-full object-cover" />
      </div>
      <div
        v-else
        class="flex items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900"
        :class="boxClass"
      >
        <UIcon name="i-heroicons-photo" class="text-4xl" />
      </div>
      <input type="file" accept="image/*" class="sr-only" @change="onChange" />
    </label>
  </div>
</template>
