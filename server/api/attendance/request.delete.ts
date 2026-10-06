import { defineEventHandler, readBody } from 'h3'
import { prisma } from '~/server/prisma'
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope'
import { cancelAttendanceRequest } from '~/server/utils/attendance-request'
export default defineEventHandler(async event => {
    const session = await useCompanyRequestSession(event)
    const body = await readBody(event)
    return prisma.$transaction(tx => cancelAttendanceRequest(tx, session.data, body?.id), { isolationLevel: 'Serializable' })
})
