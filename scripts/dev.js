#!/usr/bin/env node

const path = require('path')
const { spawn } = require('child_process')

const cdnEntries = require('../apps/cdn/entries/entries')

const rootDir = path.resolve(__dirname, '..')
const requiredCdnCompilers = new Set([
  'WORKERS',
  ...Object.keys(cdnEntries.web || {}).map((entryName) => (
    `WEB__${String(entryName || 'default').replace(/[^a-z0-9_-]/gi, '_').toUpperCase()}`
  )),
])

const children = new Map()
let isShuttingDown = false
let remainingChildren = 0
let requestedExitCode = 0

function log(message) {
  process.stdout.write(`[dev] ${message}\n`)
}

function writePrefixed(stream, writer, label, onLine) {
  let buffer = ''

  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    buffer += chunk
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (typeof onLine === 'function') {
        onLine(line)
      }

      writer.write(`[${label}] ${line}\n`)
    }
  })

  stream.on('end', () => {
    if (buffer.length > 0) {
      if (typeof onLine === 'function') {
        onLine(buffer)
      }

      writer.write(`[${label}] ${buffer}\n`)
    }
  })
}

function finalizeExitIfReady() {
  if (!isShuttingDown || remainingChildren > 0) {
    return
  }

  process.exit(requestedExitCode)
}

function stopChildren(exitCode) {
  if (isShuttingDown) {
    return
  }

  isShuttingDown = true
  requestedExitCode = exitCode

  for (const child of children.values()) {
    if (!child.killed) {
      child.kill('SIGTERM')
    }
  }

  setTimeout(() => {
    for (const child of children.values()) {
      if (!child.killed) {
        child.kill('SIGKILL')
      }
    }

    finalizeExitIfReady()
  }, 5000).unref()

  finalizeExitIfReady()
}

function run(label, args, options = {}) {
  const child = spawn('yarn', args, {
    cwd: rootDir,
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
  })

  children.set(label, child)
  remainingChildren += 1

  writePrefixed(child.stdout, process.stdout, label, options.onStdoutLine)
  writePrefixed(child.stderr, process.stderr, label, options.onStderrLine)

  child.on('exit', (code, signal) => {
    remainingChildren -= 1
    children.delete(label)

    if (!isShuttingDown) {
      const details = signal ? `signal ${signal}` : `code ${code || 0}`
      requestedExitCode = code || (signal ? 1 : 0)
      log(`${label} exited with ${details}`)
      stopChildren(requestedExitCode)
      return
    }

    finalizeExitIfReady()
  })

  child.on('error', (error) => {
    if (isShuttingDown) {
      return
    }

    log(`${label} failed to start: ${error.message}`)
    stopChildren(1)
  })

  return child
}

function createInitialCdnBuildWaiter() {
  const compiled = new Set()

  return {
    handleLine(line) {
      const normalizedLine = line.trimStart()
      const match = normalizedLine.match(/^([A-Z0-9_]+)\s+\(webpack [^)]+\) compiled successfully/)

      if (!match) {
        return false
      }

      compiled.add(match[1])

      return Array.from(requiredCdnCompilers).every((compilerName) => compiled.has(compilerName))
    },
  }
}

async function main() {
  const cdnBuildWaiter = createInitialCdnBuildWaiter()
  let resolveInitialCdnBuild
  const initialCdnBuild = new Promise((resolve) => {
    resolveInitialCdnBuild = resolve
  })

  log('starting cdn watcher')
  run('cdn', ['dev:cdn'], {
    onStdoutLine(line) {
      if (cdnBuildWaiter.handleLine(line)) {
        resolveInitialCdnBuild()
      }
    },
    onStderrLine(line) {
      if (cdnBuildWaiter.handleLine(line)) {
        resolveInitialCdnBuild()
      }
    },
  })

  log('waiting for the initial CDN build before starting extension and api')
  await initialCdnBuild

  if (isShuttingDown) {
    return
  }

  log('cdn is ready; starting extension watcher')
  run('extension', ['workspace', '@toolkit-tw-bot/extension', 'dev:watch'])

  log('starting api server')
  run('api', ['dev:api'])
}

process.on('SIGINT', () => stopChildren(0))
process.on('SIGTERM', () => stopChildren(0))

main().catch((error) => {
  process.stderr.write(`[dev] ${error.message}\n`)
  stopChildren(1)
})
