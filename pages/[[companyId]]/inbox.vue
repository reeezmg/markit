<script setup lang="ts">
import type { Mail } from '~/types'
const useAuth = () => useNuxtApp().$auth;
const { $client } = useNuxtApp()

import {
    useFindManyConversation,
    useFindManyUser,
    useCreateConversation
} from '~/lib/hooks';

definePageMeta({
    auth: false,
});
const CreateConversation = useCreateConversation();
const isOpen = ref(false)
const conversationSearch = ref('')
const userSearch = ref('')

const whatsappdata = [{
  id:"dfvdgd",
  messages:[],
  user:{
    id:"sfsfsdf",
    name:"Reezmg"
  }
}]

const tabItems = [{
  label: 'All'
}, {
  label: 'Unread'
}]
const selectedTab = ref(0)

const dropdownItems = [[{
  label: 'Mark as unread',
  icon: 'i-heroicons-check-circle'
}, {
  label: 'Mark as important',
  icon: 'i-heroicons-exclamation-circle'
}], [{
  label: 'Star thread',
  icon: 'i-heroicons-star'
}, {
  label: 'Mute thread',
  icon: 'i-heroicons-pause-circle'
}]]

const queryArgs = computed(() => {
  return {
    where: {
            AND: [
                {
                    companies: {
                        some: { companyId: useAuth().session.value?.companyId },
                    },
                },
                { name: { contains: userSearch.value } },
                { id: { not: useAuth().session.value?.id } }
            ],
        },
  }
})


const { data: users } = useFindManyUser(queryArgs);


  const {
    data: mails,
    isLoading,
    error,
    refetch,
} = useFindManyConversation({
  where:{
    users: {
        some: { userId: useAuth().session.value?.id },
    },
  },
  select:{
    id:true,
    messages:true,
    users:{
      select:{
        user:{
          select:{
            id:true,
            name:true
          }
        }
      }
    }
  },
});




// Filter mails based on the selected tab
const filteredMails = computed(() => {
const result = mails.value?.flatMap((m) => {
  return m.users
    .filter((f) => f.user.id !== useAuth().session.value?.id)
    .map((f) => ({
      id: m.id,
      messages: [...m.messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
      user: {
        id: f.user.id,
        name: f.user.name,
      },
    })).filter((f) => f.user.name && f.user.name.includes(conversationSearch.value))
});
console.log(result)
  return result   
})



const selectedMail = ref<any | null>()

const isMailPanelOpen = computed({
  get () {
    return !!selectedMail.value
  },
  set (value: boolean) {
    if (!value) {
      selectedMail.value = null
    }
  }
})

console.log(selectedMail.value)

const addmail = (resmessage) => {
  if (selectedMail.value) {
    const addedMessages = [...selectedMail.value.messages, resmessage];
    selectedMail.value.messages = addedMessages;
  }
}


const editmail = (resmessage) => {
  if (selectedMail.value) {
    const updatedMessages = selectedMail.value.messages.map(item => 
      item.id === resmessage.id ? resmessage : item
    );
    selectedMail.value = { ...selectedMail.value, messages: updatedMessages };
  }
};

const deletemail = (resmessage) => {
  if (selectedMail.value) {
    const updatedMessages = selectedMail.value.messages.map(item => 
      item.id === resmessage.id ? resmessage : item
    );
    selectedMail.value = { ...selectedMail.value, messages: updatedMessages };
  }
};


$client.onMessage.subscribe({id:useAuth().session.value?.id}, {
  onData(message) {
    if (selectedMail.value && selectedMail.value.id === message.conversationId ) {
    const updatedMessages = [...selectedMail.value.messages, message];
    selectedMail.value.messages = updatedMessages;
  }
  },
})

const openConversation = async (user) => {
  conversationSearch.value = '';
  const currentUserId = useAuth().session.value?.id;
  
  for (const i of filteredMails.value || []) {
    if (i.user.id === user.id) {
      selectedMail.value = i;
    } else {
      try {
        const resconv = await CreateConversation.mutateAsync({
          data: {
            users: {
              create: [
                { user: { connect: { id: currentUserId } } },
                { user: { connect: { id: user.id } } }
              ],
            },
          },
        });

        console.log(resconv);
      } catch (error) {
        console.error('Error creating conversation:', error);
      }
    }
  }
  isOpen.value = false;
}

const open = ref('normal')
const links = [
    [
        {
            label: 'Default',
            
        },
        {
            label: 'Whatsapp',
        },
        {
            label: 'Instagram',
        },
    ],
];


</script>

<template>
  <UDashboardPage>
    <UDashboardPanel id="inbox" :width="400" :resizable="{ min: 300, max: 500 }">
      <UDashboardToolbar class="py-0 px-1.5 overflow-x-auto">
                <UHorizontalNavigation :links="links" />
            </UDashboardToolbar>
      <UDashboardNavbar title="Inbox" :badge="filteredMails?.length || 0 ">
        <template #right>
          <UIcon name="i-heroicons-plus" class=" text-lg" @click="isOpen = true" />
        </template>
        </UDashboardNavbar>

      <!-- ~/components/inbox/InboxList.vue -->
       <div class=" px-5 py-5">
        <UInput
        icon="i-heroicons-magnifying-glass-20-solid"
        size="sm"
        color="white"
        :trailing="false"
        placeholder="Search..."
        v-model="conversationSearch"
      />
       </div>
       <UDivider />
      <InboxList v-model="selectedMail" :mails="filteredMails"  />
    </UDashboardPanel>

    <UDashboardPanel v-model="isMailPanelOpen" collapsible grow side="right">
      <template v-if="selectedMail">
        <UDashboardNavbar>
          <template #toggle>
            <UDashboardNavbarToggle icon="i-heroicons-x-mark" />
            <UDivider orientation="vertical" class="mx-1.5 lg:hidden" />
          </template>

          <template #left>
            <UTooltip text="Archive">
              <UButton icon="i-heroicons-archive-box" color="gray" variant="ghost" />
            </UTooltip>

            <UTooltip text="Move to junk">
              <UButton icon="i-heroicons-archive-box-x-mark" color="gray" variant="ghost" />
            </UTooltip>

            <UDivider orientation="vertical" class="mx-1.5" />

            <UPopover :popper="{ placement: 'bottom-start' }">
              <template #default="{ open }">
                <UTooltip text="Snooze" :prevent="open">
                  <UButton icon="i-heroicons-clock" color="gray" variant="ghost" :class="[open && 'bg-gray-50 dark:bg-gray-800']" />
                </UTooltip>
              </template>

              <template #panel="{ close }">
                <DatePicker @close="close" />
              </template>
            </UPopover>
          </template>

          <template #right>
            <UTooltip text="Reply">
              <UButton icon="i-heroicons-arrow-uturn-left" color="gray" variant="ghost" />
            </UTooltip>

            <UTooltip text="Forward">
              <UButton icon="i-heroicons-arrow-uturn-right" color="gray" variant="ghost" />
            </UTooltip>

            <UDivider orientation="vertical" class="mx-1.5" />

            <UDropdown :items="dropdownItems">
              <UButton icon="i-heroicons-ellipsis-vertical" color="gray" variant="ghost" />
            </UDropdown>
          </template>
        </UDashboardNavbar>
       
        <!-- ~/components/inbox/InboxMail.vue -->
        <InboxMail :mail="selectedMail" @add:mails="addmail" @edit:mails="editmail" @delete:mails="deletemail" />
      </template>
      <div v-else class="flex-1 hidden lg:flex items-center justify-center">
        <UIcon name="i-heroicons-inbox" class="w-32 h-32 text-gray-400 dark:text-gray-500" />
      </div>
    </UDashboardPanel>
    <UModal v-model="isOpen">
      <UCard :ui="{ ring: '', divide: 'divide-y divide-gray-100 dark:divide-gray-800' }">
        <template #header>
          <UInput
        icon="i-heroicons-magnifying-glass-20-solid"
        size="sm"
        color="white"
        :trailing="false"
        placeholder="Search..."
        v-model="userSearch"
      />
        </template>
        <UDivider />

        <div v-for="(user,index) in users" :key="index">
          <div class="flex flex-row justify-between">
            <div class="flex flex-row my-3">
              <UAvatar
                    size="sm"
                    src="https://avatars.githubusercontent.com/u/739984?v=4"
                    alt="Avatar"
                    class="me-3"
              />
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  {{ user.name }}
                </div>
              </div>
            </div>
          <div class="my-3">
          <UButton color="primary" variant="solid" @click="() => openConversation(user)">Message</UButton>
        </div>
        </div>
      <UDivider />
      </div>

      </UCard>
    </UModal>
  </UDashboardPage>
</template>
