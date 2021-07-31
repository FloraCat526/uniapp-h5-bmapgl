import { extend } from '@vue/shared'
import { BuildOptions, ServerOptions } from 'vite'
import { CliOptions } from '.'
import { build, buildSSR } from './build'
import { runNVue } from './nvue'
import { createServer, createSSRServer } from './server'
import { initEnv } from './utils'

export async function runDev(options: CliOptions & ServerOptions) {
  initEnv('dev', options)
  try {
    if (options.platform === 'h5') {
      await (options.ssr ? createSSRServer(options) : createServer(options))
    } else {
      await build(extend(options, { watch: true }))
    }
    if (options.platform === 'app') {
      await runNVue('dev')
    }
  } catch (e) {
    console.error(`error when starting dev server:\n${e.stack || e}`)
    process.exit(1)
  }
}

export async function runBuild(options: CliOptions & BuildOptions) {
  initEnv('build', options)
  try {
    await (options.ssr && options.platform === 'h5'
      ? buildSSR(options)
      : build(options))
    if (options.platform === 'app') {
      await runNVue('prod')
    }
    console.log(` DONE  Build complete.`)
  } catch (e) {
    console.error(`error during build:\n${e.stack || e}`)
    process.exit(1)
  }
}
