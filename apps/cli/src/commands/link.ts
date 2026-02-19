import { printHeader } from '../format.js'
import { linkDevice } from './link-shared.js'

export async function linkCommand(): Promise<void> {
  printHeader('Linking CLI to your account')

  await linkDevice({
    force: true,
    openBrowser: true,
  })

  console.log('  Link complete.')
  console.log()
}
