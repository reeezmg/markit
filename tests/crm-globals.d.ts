import type { Ref } from 'vue'
import type { H3Event } from 'h3'
declare global {
  const $fetch: typeof import('ofetch')['$fetch']
  const computed: typeof import('vue')['computed']
  function definePageMeta(meta:Record<string,unknown>):void
  const useRoute:typeof import('vue-router')['useRoute']
  function requireAuthSession(event:H3Event):Promise<{data:{id:string;companyId:string;role:string;[key:string]:any}}>
  function useAuthSession(event:H3Event):Promise<{data:{id:string;companyId:string;role:string;[key:string]:any}}>
  function useCompanyScope(mode?:'form'|'table'):{companyId:Ref<string>;busy:Ref<boolean>;ready:Promise<void>;auth:{session:Ref<Record<string,any>|null>};selectCompany(id:string):Promise<void>;fetch:any}
  function useRuntimeConfig():any
  const createError:typeof import('h3')['createError']
  const defineEventHandler:typeof import('h3')['defineEventHandler']
}
export {}
