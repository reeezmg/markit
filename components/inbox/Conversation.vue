<script setup lang="ts">
const useAuth = () => useNuxtApp().$auth;

const props = defineProps({
  mail: {
    type: Object as PropType<any>,
    required: true
  },
  selectedMail: {
    type: Object as PropType<any>,
  },
  online:{
    type:Boolean
  }
})
const emit = defineEmits(['update:selectedMail'])

const updateMails = (mail) => {
    emit('update:selectedMail', mail)
    unseen.value= 0;
}
const unseen = ref(0)

onMounted(() => {
    let count = 0;
  const userId = useAuth().session.value?.id;

  props.mail.messages.forEach((item) => {
    if (!item.seen.includes(userId)) {
      count += 1;
      console.log(count)
    }
  });
  unseen.value = count
});
</script>
<template>
     <div
        class="p-4 text-sm cursor-pointer border-l-2"
        :class="[
          mail.unread ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300',
          selectedMail && selectedMail.id === mail.id ? 'border-primary-500 dark:border-primary-400 bg-primary-100 dark:bg-primary-900/25' : 'border-white dark:border-gray-900 hover:border-primary-500/25 dark:hover:border-primary-400/25 hover:bg-primary-100/50 dark:hover:bg-primary-900/10'
        ]"
        @click="() => updateMails(mail)"
      >
      <div class="flex flex-row">
            <UAvatar
              v-if="online"
              chip-color="green"
              chip-text=""
              chip-position="top-right"
              size="sm"
              src="https://avatars.githubusercontent.com/u/739984?v=4"
              alt="Avatar"
              class="me-3"
        />
        <UAvatar
              v-else
              size="sm"
              src="https://avatars.githubusercontent.com/u/739984?v=4"
              alt="Avatar"
              class="me-3"
        />
        <div class="flex items-center justify-between" :class="[mail.unread && 'font-semibold']">
          <div class="flex items-center gap-3">
            {{ mail.user.name }}

            <UChip :text="unseen" size="xl" v-if="unseen > 0" />
          </div>

          <!-- <span>{{ isToday(new Date(mail.date)) ? format(new Date(mail.date), 'HH:mm') : format(new Date(mail.date), 'dd MMM') }}</span> -->
        </div>
      </div>
        <!-- <p :class="[mail.unread && 'font-semibold']">
         subject
        </p>
        <p class="text-gray-400 dark:text-gray-500 line-clamp-1">
         body
        </p> -->

      </div>
</template>