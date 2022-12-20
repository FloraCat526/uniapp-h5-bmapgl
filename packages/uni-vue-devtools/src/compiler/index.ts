import type { Plugin } from 'vite'
import fs from 'fs'
import path from 'path'
import {
  defineUniMainJsPlugin,
  isMiniProgramPlatform,
} from '@dcloudio/uni-cli-shared'
// eslint-disable-next-line no-restricted-globals
const { initDevtoolsServer } = require('../lib/front/server.js')

let copied = false
let initializedServer = false

const uniVueDevtoolsPlugin = (): Plugin => {
  return {
    name: 'uni:vue-devtools',
    config() {
      return new Promise(async (resolve) => {
        let __VUE_DEVTOOLS_HOST__ = 'localhost'
        let __VUE_DEVTOOLS_PORT__ = 8098

        if (process.env.__VUE_PROD_DEVTOOLS__ && !initializedServer) {
          initializedServer = true
          const { socketHost, socketPort } = await initDevtoolsServer()
          __VUE_DEVTOOLS_HOST__ = socketHost
          __VUE_DEVTOOLS_PORT__ = socketPort
        }

        resolve({
          define: {
            __VUE_PROD_DEVTOOLS__: process.env.__VUE_PROD_DEVTOOLS__ === 'true',
            __VUE_DEVTOOLS_HOST__: JSON.stringify(`${__VUE_DEVTOOLS_HOST__}`),
            __VUE_DEVTOOLS_PORT__: JSON.stringify(`${__VUE_DEVTOOLS_PORT__}`),
          },
        })
      })
    },
    generateBundle() {
      if (copied || process.env.__VUE_PROD_DEVTOOLS__ !== 'true') {
        return
      }
      copied = true
      const vueDevtoolsDir = path.resolve(
        process.env.UNI_OUTPUT_DIR!,
        'vue-devtools'
      )
      if (!fs.existsSync(vueDevtoolsDir)) {
        fs.mkdirSync(vueDevtoolsDir, { recursive: true })
      }
      fs.copyFileSync(
        path.resolve(__dirname, '../lib/mp/backend.js'),
        path.resolve(vueDevtoolsDir, 'backend.js')
      )
      fs.copyFileSync(
        path.resolve(__dirname, '../lib/mp/hook.js'),
        path.resolve(vueDevtoolsDir, 'hook.js')
      )
    },
  }
}

export default () => {
  return [
    uniVueDevtoolsPlugin(),
    defineUniMainJsPlugin((opts) => {
      let devtoolsCode = `;import '@dcloudio/uni-vue-devtools';`
      if (isMiniProgramPlatform()) {
        devtoolsCode += `require('./vue-devtools/hook.js');require('./vue-devtools/backend.js');`
      } else {
        const dir = process.env.UNI_PLATFORM === 'app' ? 'app' : 'web'
        devtoolsCode += `import '@dcloudio/uni-vue-devtools/lib/${dir}/hook.js';import '@dcloudio/uni-vue-devtools/lib/${dir}/backend.js';`
      }

      return {
        name: 'uni:vue-devtools-main-js',
        enforce: 'post',
        transform(code: string, id: string) {
          if (process.env.__VUE_PROD_DEVTOOLS__ !== 'true') {
            return
          }
          if (!opts.filter(id)) {
            return
          }
          return {
            code: devtoolsCode + code,
            map: null,
          }
        },
      }
    }),
  ]
}
