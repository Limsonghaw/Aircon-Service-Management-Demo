import test from 'node:test'
import assert from 'node:assert/strict'
import { watchCustomerPicker } from '../src/utils/customerPickerEvents.ts'

function fixture() {
  const document = new EventTarget()
  const root = new EventTarget()
  const input = { focus: () => order.push('focus') }
  const option = {}
  const order = []
  root.ownerDocument = document
  root.contains = node => [root, input, option].includes(node)
  root.querySelector = () => input
  const cleanup = watchCustomerPicker(root, () => order.push('dismiss'))
  function send(target, type, node, props = {}) {
    const event = new Event(type, { cancelable: true })
    for (const [key,value] of Object.entries({ target: node, ...props })) Object.defineProperty(event,key,{value})
    target.dispatchEvent(event)
    return event
  }
  return { document,root,input,option,order,cleanup,send }
}

test('touch option followed by null-target blur remains available for click selection', () => {
  const f=fixture()
  f.send(f.document,'pointerdown',f.option,{pointerType:'touch'})
  f.send(f.document,'blur',f.input,{relatedTarget:null})
  assert.deepEqual(f.order,[])
  let selected=''
  if (!f.order.includes('dismiss')) selected='safe-customer'
  assert.equal(selected,'safe-customer')
  f.cleanup()
})
test('mouse and keyboard interactions inside results do not dismiss', () => {
  const f=fixture()
  f.send(f.document,'pointerdown',f.option,{pointerType:'mouse'})
  f.send(f.document,'focusin',f.option)
  assert.deepEqual(f.order,[])
  f.cleanup()
})
test('outside touch and keyboard focus each dismiss', () => {
  const f=fixture()
  f.send(f.document,'pointerdown',{})
  f.send(f.document,'focusin',{})
  assert.deepEqual(f.order,['dismiss','dismiss'])
  f.cleanup()
})
test('touch scrolling is not cancelled and does not select or dismiss', () => {
  const f=fixture()
  const event=f.send(f.document,'pointerdown',f.option,{pointerType:'touch'})
  f.send(f.document,'pointercancel',f.option)
  assert.equal(event.defaultPrevented,false)
  assert.deepEqual(f.order,[])
  f.cleanup()
})
test('Escape restores input focus before closing; other keys remain unchanged', () => {
  const f=fixture()
  assert.equal(f.send(f.root,'keydown',f.option,{key:'Enter'}).defaultPrevented,false)
  const event=f.send(f.root,'keydown',f.option,{key:'Escape'})
  assert.equal(event.defaultPrevented,true)
  assert.deepEqual(f.order,['focus','dismiss'])
  f.cleanup()
})
test('unmount or closing releases all listeners', () => {
  const f=fixture()
  f.cleanup()
  f.send(f.document,'pointerdown',{})
  f.send(f.document,'focusin',{})
  f.send(f.root,'keydown',f.option,{key:'Escape'})
  assert.deepEqual(f.order,[])
})
