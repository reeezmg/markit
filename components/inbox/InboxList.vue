<script setup lang="ts">
import { format, isToday } from 'date-fns'
import type { Mail } from '~/types'
import type { Prisma } from '@prisma/client';

const { $client } = useNuxtApp()
const onlineUsers:any = ref([]);
const props = defineProps({
  modelValue: {
    type: Object as PropType<Mail | null>,
    default: null
  },
  mails: {
    type: Array as PropType<Prisma.ConversationFindManyArgs[]>,
    default: () => []
  }
})

$client.onOnlineUsers.subscribe(undefined, {
  onData(data) {
    console.log(data)
    if (data) {
      console.log(data)
      onlineUsers.value = data;
  }
  },
})

onMounted(async() => {
  const res = await $client.getOnlineUsers.query();
  onlineUsers.value = res;
})

const emit = defineEmits(['update:modelValue'])

const mailsRefs = ref<Element[]>([])

const selectedMail = computed({
  get() {
    return props.modelValue
  },
  set(value: Mail | null) {
    emit('update:modelValue', value)
  }
})

console.log(onlineUsers)



const updateSelectedMail = (mail) => {
  console.log(mail)
  selectedMail.value = mail
}

defineShortcuts({
  arrowdown: () => {
    const index = props.mails.findIndex((mail) => mail.id === selectedMail.value?.id)

    if (index === -1) {
      selectedMail.value = props.mails[0]
    } else if (index < props.mails.length - 1) {
      selectedMail.value = props.mails[index + 1]
    }
  },
  arrowup: () => {
    const index = props.mails.findIndex((mail) => mail.id === selectedMail.value?.id)

    if (index === -1) {
      selectedMail.value = props.mails[props.mails.length - 1]
    } else if (index > 0) {
      selectedMail.value = props.mails[index - 1]
    }
  }
})
</script>

<template>
  <UDashboardPanelContent class="p-0">
    <div  v-for="(mail, index) in mails" :key="index" >
      <inboxConversation data-testid="inbox" :selectedMail="selectedMail" @update:selectedMail="updateSelectedMail" :mail="mail" :online = "onlineUsers.includes(mail.user.id)" />
      <UDivider />
    </div> 
  </UDashboardPanelContent>
</template>