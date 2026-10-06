import { defineEventHandler } from 'h3'
import { rejectLegacyAccountingWrite } from '~/server/utils/legacy-accounting'

export default defineEventHandler(rejectLegacyAccountingWrite)
