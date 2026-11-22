import prune from './after-pack-prune.mjs'
import check from './check-packaged-files.mjs'

export default async function afterPack(context) {
  await prune(context)
  check(context)
}
