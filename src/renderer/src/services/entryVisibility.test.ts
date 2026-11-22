import { mergeVisibility, providerEntryState, VisibilityDecisions } from './entryVisibility'

test('provider decisions distinguish pending, hidden, available and disabled with optional reason', () => {
  expect(providerEntryState(true, undefined)).toEqual({state:'pending'})
  expect(providerEntryState(true, null, 'any')).toEqual({state:'hidden'})
  for (const reason of [undefined, '', '请先连接账户']) {
    const disabled = reason === undefined ? {state:'disabled'} : {state:'disabled', reason}
    expect(providerEntryState(undefined, disabled)).toEqual(disabled)
    expect(providerEntryState(false, disabled, 'all')).toEqual({state:'hidden'})
    expect(providerEntryState(false, disabled, 'any')).toEqual(disabled)
  }
  expect(providerEntryState(true, {state:'disabled', reason:'x'.repeat(161)})).toEqual({state:'hidden'})
  expect(providerEntryState(false, 'force-show')).toEqual({state:'available'})
  expect(providerEntryState(true, 'force-hide')).toEqual({state:'hidden'})
})

test('predicate-only, all, any, overrides and invalid results', () => {
  for (const condition of [true,false]) for (const decision of [true,false]) {
    expect(mergeVisibility(undefined,decision,'any')).toBe(decision)
    expect(mergeVisibility(condition,decision)).toBe(condition && decision)
    expect(mergeVisibility(condition,decision,'all')).toBe(condition && decision)
    expect(mergeVisibility(condition,decision,'any')).toBe(condition || decision)
    expect(mergeVisibility(condition,'force-show')).toBe(true)
    expect(mergeVisibility(condition,'force-hide','any')).toBe(false)
    expect(mergeVisibility(condition,undefined,'any')).toBe(false)
    expect(mergeVisibility(condition,{visible:true},'any')).toBe(false)
  }
})

test('shared evaluations deduplicate and never publish old results after selection, removal or reinstall', async () => {
  const changed = jest.fn(), cache = new VisibilityDecisions(changed)
  let resolve!: (value: unknown) => void
  const delayed = jest.fn(() => new Promise(done => {resolve = done}))
  const first = cache.evaluate('owner/page','wy',delayed)
  await cache.evaluate('owner/page','wy',delayed)
  expect(delayed).toHaveBeenCalledTimes(1)
  expect(cache.read('owner/page','wy')).toBeUndefined()
  await cache.evaluate('owner/page','local',async () => false)
  resolve('force-show'); await first
  expect(cache.read('owner/page','wy')).toBeUndefined()
  expect(cache.read('owner/page','local')).toBe(false)
  const removed = cache.evaluate('owner/page','wy',delayed)
  cache.retain(new Set())
  await cache.evaluate('owner/page','wy',async () => 'force-hide')
  resolve(true); await removed
  expect(cache.read('owner/page','wy')).toBe('force-hide')
  expect(changed).toHaveBeenCalledTimes(2)
})
