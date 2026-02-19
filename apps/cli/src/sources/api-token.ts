import { rm, mkdir, readFile, writeFile } from 'node:fs/promises'
import { platform } from 'node:os'
import { spawn } from 'node:child_process'
import { acApiTokenPath, acDir } from './paths.js'

const TOKEN_DIR_MODE = 0o700
const TOKEN_FILE_MODE = 0o600

function quotePowerShell(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

async function runPowerShell(script: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', chunk => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', chunk => {
      stderr += chunk.toString()
    })

    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) {
        resolve(stdout.trim())
        return
      }
      reject(new Error(stderr.trim() || `powershell exited with code ${code}`))
    })
  })
}

async function protectForWindows(rawToken: string): Promise<string> {
  const script = `$secret = ConvertTo-SecureString -String ${quotePowerShell(rawToken)} -AsPlainText -Force; ConvertFrom-SecureString -SecureString $secret`
  return await runPowerShell(script)
}

async function unprotectForWindows(encryptedToken: string): Promise<string | null> {
  const script = `$secret = ConvertTo-SecureString -String ${quotePowerShell(encryptedToken)}; $plain = [System.Net.NetworkCredential]::new('', $secret).Password; Write-Output $plain`
  const value = await runPowerShell(script)
  return value.length > 0 ? value : null
}

async function writeStoredApiToken(token: string): Promise<void> {
  const trimmed = token.trim()
  if (!trimmed) {
    await clearStoredApiToken()
    return
  }

  await mkdir(acDir, { recursive: true, mode: TOKEN_DIR_MODE })

  if (platform() === 'win32') {
    const protectedValue = await protectForWindows(trimmed)
    await writeFile(acApiTokenPath, protectedValue, {
      encoding: 'utf-8',
      mode: TOKEN_FILE_MODE,
    })
    return
  }

  await writeFile(acApiTokenPath, trimmed, {
    encoding: 'utf-8',
    mode: TOKEN_FILE_MODE,
  })
}

async function readStoredApiToken(): Promise<string | null> {
  try {
    const raw = (await readFile(acApiTokenPath, 'utf-8')).trim()
    if (!raw) {
      return null
    }

    if (platform() === 'win32') {
      return await unprotectForWindows(raw)
    }

    return raw
  } catch {
    return null
  }
}

async function clearStoredApiToken(): Promise<void> {
  try {
    await rm(acApiTokenPath, { force: true })
  } catch {
    // ignore cleanup errors
  }
}

export { clearStoredApiToken, readStoredApiToken, writeStoredApiToken }
