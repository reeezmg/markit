import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scopeOrganizationModelReads } from '../server/utils/organizationModelScope'

function fixture() {
  const calls:any[]=[]
  const delegate={findUnique:async()=>({companyId:'owner'}),update:async(args:any)=>{calls.push(args);return args},updateMany:async(args:any)=>{calls.push(args);return args},createManyAndReturn:async()=>{throw Error('Bypass')},updateManyAndReturn:async()=>{throw Error('Bypass')},deleteMany:async()=>{throw Error('Bypass')}}
  const db:any={bill:delegate,payment:delegate,entry:delegate,account:delegate,$transaction:async(fn:any)=>fn(db)}
  return {calls,api:scopeOrganizationModelReads(db,'owner',['owner'])}
}

test('generated payment/entry mutations and advanced bulk operations cannot bypass receipts',async()=>{
  const f=fixture()
  for(const model of ['payment','entry']) for(const operation of ['update','updateMany','deleteMany','createManyAndReturn','updateManyAndReturn'])
    await assert.rejects(f.api[model][operation]({where:{id:'record'},data:{amount:100}}),/dated credit receipts/)
  assert.equal(f.calls.length,0)
})

test('direct/bulk financial bill changes and nested receipt deletion reject',async()=>{
  const f=fixture()
  for(const field of ['paymentStatus','splitPayments','originalGrandTotal','precedence','clientId','paidAt','type','isMarkit'])
    await assert.rejects(f.api.bill.update({where:{id:'bill'},data:{[field]:'changed'}}),/dated credit receipts/)
  await assert.rejects(f.api.bill.updateMany({data:{paymentStatus:'PAID'}}),/dated credit receipts/)
  await assert.rejects(f.api.account.update({where:{id:'customer'},data:{bill:{deleteMany:{}}}}),/dated credit receipts/)
  await assert.rejects(f.api.account.update({where:{id:'customer'},data:{bill:{connect:{id:'bill'}}}}),/dated credit receipts/)
  assert.equal(f.calls.length,0)
})

test('non-financial bill notes and order status remain scoped and editable',async()=>{
  const f=fixture()
  await f.api.bill.update({where:{id:'bill'},data:{notes:'Call customer'}})
  await f.api.bill.update({where:{id:'bill'},data:{status:'BOOKED'}})
  assert.equal(f.calls.length,2)
  assert.deepEqual(f.calls[0].where.AND.at(-1),{companyId:{in:['owner']}})
})
