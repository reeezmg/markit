<script setup lang="ts">
import { format, isToday } from 'date-fns'

import {
    useCreateConversation,
    useCreateMessage,
    useUpdateMessage
} from '~/lib/hooks';
import type { Message } from '~/types';
const { $client } = useNuxtApp();
const CreateMessage = useCreateMessage();
const CreateConversation = useCreateConversation();
const UpdateMessage = useUpdateMessage();
const useAuth = () => useNuxtApp().$auth;
const props = defineProps({
  mail: {
    type: Object as PropType<any>,
    required: true
  },
  selected: {
    type: Boolean,
    default: false
  }
})


const emit = defineEmits(['add:mails', 'edit:mails','delete:mails']);
const mailsRefs = ref<HTMLElement | null>(null);
const text = ref('')
const typing = ref(false)
const messageStore = useMessageStore()
const storedMessage = ref(messageStore.$state)

watch(props.mail, (newMail) => {
    console.log(newMail);
    if (mailsRefs.value) {

    }
});

$client.onTyping.subscribe({id:useAuth().session.value?.id}, {
  onData(data) {
    if (props.mail.id === data) {
      typing.value = true;
      
      setTimeout(() => {
        typing.value = false;
      }, 3000);
  }
  },
})


const handleTextChange = () => {
  $client.typing.query({ data: {to:props.mail.user.id, conversationId:props.mail.id} });
};

const sendMessage = async () => {
  console.log(storedMessage.value)
  if(storedMessage.value && storedMessage.value.edit && text.value !== ''){
    const resmessage = await UpdateMessage.mutateAsync({
      where: { id: storedMessage.value.id },
      data: {
        edited: true,
        text: text.value
      }
    })
    text.value = '',
    messageStore.clear()
    console.log(storedMessage.value)
    emit('edit:mails', resmessage)
  }
  else if(text.value !== ''){
    const resmessage = await CreateMessage.mutateAsync({
    data:{
      conversation:{
        connect:{
          id:props.mail.id
        }
      },
      senderId:useAuth().session.value?.id || '' ,
      text:text.value,
      seen:[useAuth().session.value?.id],
      replyto:storedMessage.value? storedMessage.value.id : undefined
    }
  })
   text.value = '',
  messageStore.$reset()
  $client.sendMessage.query({ message: resmessage, to:props.mail.user.id})
  emit('add:mails', resmessage)
  }
 

  

}

const deleteMessage = async() => {
  if(storedMessage.value && storedMessage.value.delete){
    const resmessage = await UpdateMessage.mutateAsync({
      where: { id: storedMessage.value.id },
      data: {
        deleted: true,
      }
    })
    messageStore.clear()
    emit('delete:mails', resmessage)
  }
}

</script>

<template>
  <UDashboardPanelContent>
    <UDivider class="my-2" />
    <div class="flex-1 flex justify-end flex-col">
      <inboxMessage  v-for="message in mail.messages" :key="message.id" :message="message" @delete="deleteMessage"/>
      <div v-if="typing" class="text-gray-500">Typing...</div>
    </div>
    <UDivider class="my-3" />
    <form  @submit.prevent="sendMessage">
      <div v-if="storedMessage && storedMessage.reply" class="my-3">Reply to : {{ storedMessage.text }}</div>
      <div v-else-if="storedMessage && storedMessage.edit" class="my-3">Edit : {{ storedMessage.text }}</div>
      <UTextarea color="gray" required size="xl" :rows="3" :placeholder="`Reply to ${mail.user?.name}`" v-model="text" @input="handleTextChange">
        <UButton type="submit" color="black" label="Send" icon="i-heroicons-paper-airplane" class="absolute bottom-2.5 right-3.5" />
      </UTextarea>
    </form>
  </UDashboardPanelContent>
</template>
