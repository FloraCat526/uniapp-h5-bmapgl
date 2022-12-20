import type { Plugin } from 'vite'
import path from 'path'
import {
  parseVueRequest,
  resolveUtsAppModule,
  resolveUTSCompiler,
} from '@dcloudio/uni-cli-shared'

const UTSProxyRE = /\?uts-proxy$/
function isUTSProxy(id: string) {
  return UTSProxyRE.test(id)
}
export function uniUtsV1Plugin(): Plugin {
  return {
    name: 'uni:uts',
    apply: 'build',
    enforce: 'pre',
    resolveId(id, importer) {
      if (isUTSProxy(id)) {
        return id
      }
      const module = resolveUtsAppModule(
        id,
        importer ? path.dirname(importer) : process.env.UNI_INPUT_DIR
      )
      if (module) {
        // prefix the polyfill id with \0 to tell other plugins not to try to load or transform it
        return '\0' + module + '?uts-proxy'
      }
    },
    load(id) {
      if (isUTSProxy(id)) {
        return ''
      }
    },
    async transform(_, id, opts) {
      if (opts && opts.ssr) {
        return
      }

      if (!isUTSProxy(id)) {
        return
      }
      const { filename: pluginDir } = parseVueRequest(id.replace('\0', ''))
      const result = await resolveUTSCompiler().compile(pluginDir)
      if (result) {
        result.deps.forEach((dep) => {
          this.addWatchFile(dep)
        })
        return result.code
      }
    },
  }
}
