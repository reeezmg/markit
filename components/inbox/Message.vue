<script setup lang="ts">
import type { Message } from '~/types';
import { useUpdateMessage, useFindUniqueMessage } from '~/lib/hooks';
import type { Prisma } from '@prisma/client';
import { format, isToday } from 'date-fns';

const useAuth = () => useNuxtApp().$auth;
const UpdateMessage = useUpdateMessage()

const props = defineProps<{
  message: Message; 
}>();

const messageStore = useMessageStore()

const replyto = ref(null);
const isLoading = ref(false);

const emit = defineEmits(['delete']);    

const reply = () => {
  messageStore.addToreply(props.message)
}
const edit = () => {
  messageStore.addToEdit(props.message)
}

const del = () => {
  messageStore.addToDelete(props.message)
  emit('delete')
}

const markAsSeen = () => {
  if (!props.message.seen.includes(useAuth().session.value?.id)) {
    UpdateMessage.mutateAsync({
      where: { id: props.message.id },
      data: {
        seen: {
          push: useAuth().session.value?.id
        }
      }
    })
  }
}


onMounted(() => {
  markAsSeen();

  if (props.message.replyto) {
    const { data, isLoading: loading, error: err, refetch } = useFindUniqueMessage({
      where: { id: props.message.replyto }
    });
    console.log(data)
    replyto.value = data;
    isLoading.value = loading;
  }       
});

const items = computed(() => [
  [
    {
    label: 'Reply',
    icon: 'i-heroicons-arrow-uturn-left',
    click: () => reply()
  },
  {
    label: 'Edit',
    icon: 'i-heroicons-arrow-uturn-left',
    click: () => edit()
  },
  {
    label: 'Delete',
    icon: 'i-heroicons-arrow-uturn-left',
    click: () => del()
  },
]
]);

const open = ref(true);
</script>

<template>
   <div v-if="message.deleted" :class="`flex mb-3 ${useAuth().session.value?.id === message.senderId ? 'justify-end' : ''}`">
      <div>
        <div :class="`bg-gray-800 text-gray-500 rounded-lg p-2 border  ${useAuth().session.value?.id === message.senderId ? ' border-orange-300' : 'text-start '} `">
          Message deleted
        </div>
        <div :class="`text-xs text-gray-500  ${useAuth().session.value?.id === message.senderId ? 'text-end' : 'text-start '}`">
          <span>{{ isToday(new Date(message.updatedAt)) ? format(new Date(message.updatedAt), 'HH:mm') : format(new Date(message.updatedAt), 'dd MMM') }}</span>
        </div>
      </div>
  </div>
  <div v-else :class="`flex mb-3 ${useAuth().session.value?.id === message.senderId ? 'justify-end' : ''}`">
    <UDropdown :items="items" :ui="{ item: { disabled: 'cursor-text select-text' } }" :popper="{ placement: 'right-start' }">
      <div>
        <div :class="`bg-gray-800 rounded-lg p-2 border  text-white ${useAuth().session.value?.id === message.senderId ? ' border-orange-300' : 'text-start '} `">
          <div v-if="replyto?.value" :class="`p-2 rounded-lg border bg-gray-600 ${useAuth().session.value?.id === replyto?.value.senderId ? 'border-orange-300' : '' }`">
            {{ replyto.value.text }}
          </div>
          {{ message.text }}
        </div>
        <div :class="`text-xs text-gray-500  ${useAuth().session.value?.id === message.senderId ? 'text-end' : 'text-start '}`">
          <span v-if="message.edited" class="me-1">edited</span>
          <span>{{ isToday(new Date(message.updatedAt)) ? format(new Date(message.updatedAt), 'HH:mm') : format(new Date(message.updatedAt), 'dd MMM') }}</span>
        </div>
      </div>
    </UDropdown>
  </div>
</template>
