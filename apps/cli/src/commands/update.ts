import { printHeader } from '../format.js'
import { updateNow } from './auto-update.js'

export async function updateCommand(): Promise<void> {
  printHeader('Checking for updates')
  await updateNow()
  console.log()
}
