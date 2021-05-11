import {
  defineComponent,
  Ref,
  ref,
  watch,
  onMounted,
  onUnmounted,
  provide,
  ComputedRef,
  computed,
  reactive,
  VNode,
  markRaw,
  SetupContext,
} from 'vue'
import { upx2px } from '@dcloudio/uni-api'
import { useCustomEvent, CustomEventTrigger } from '../../helpers/useEvent'
import { useTouchtrack } from '../../helpers/useTouchtrack'
import { flatVNode } from '../../helpers/flatVNode'

const props = {
  indicatorDots: {
    type: [Boolean, String],
    default: false,
  },
  vertical: {
    type: [Boolean, String],
    default: false,
  },
  autoplay: {
    type: [Boolean, String],
    default: false,
  },
  circular: {
    type: [Boolean, String],
    default: false,
  },
  interval: {
    type: [Number, String],
    default: 5e3,
  },
  duration: {
    type: [Number, String],
    default: 500,
  },
  current: {
    type: [Number, String],
    default: 0,
  },
  indicatorColor: {
    type: String,
    default: '',
  },
  indicatorActiveColor: {
    type: String,
    default: '',
  },
  previousMargin: {
    type: String,
    default: '',
  },
  nextMargin: {
    type: String,
    default: '',
  },
  currentItemId: {
    type: String,
    default: '',
  },
  skipHiddenItemLayout: {
    type: [Boolean, String],
    default: false,
  },
  displayMultipleItems: {
    type: [Number, String],
    default: 1,
  },
  disableTouch: {
    type: [Boolean, String],
    default: false,
  },
}

type Props = Record<keyof typeof props, any>

export interface SwiperContext {
  rootRef: Ref<HTMLElement | null>
  getItemId(): string
  getBoundingClientRect(): DOMRect
  updatePosition(position: number, vertical: boolean): void
}
export type AddSwiperContext = (context: SwiperContext) => void
export type RemoveSwiperContext = (context: SwiperContext) => void

function upx2pxStr(val: string): string {
  if (/\d+[ur]px$/i.test(val)) {
    val.replace(/\d+[ur]px$/i, (text) => {
      return `${upx2px(parseFloat(text))}px`
    })
  }
  return val || ''
}

interface State {
  interval: number
  duration: number
  displayMultipleItems: number
  current: number
  currentItemId: string
  userTracking: boolean
}
function useState(props: Props) {
  const interval = computed(() => {
    const interval = Number(props.interval)
    return isNaN(interval) ? 5e3 : interval
  })
  const duration = computed(() => {
    const duration = Number(props.duration)
    return isNaN(duration) ? 500 : duration
  })
  const displayMultipleItems = computed(() => {
    const displayMultipleItems = Math.round(props.displayMultipleItems)
    return isNaN(displayMultipleItems) ? 1 : displayMultipleItems
  })
  const state: State = reactive({
    interval,
    duration,
    displayMultipleItems,
    current: Math.round(props.current) || 0,
    currentItemId: props.currentItemId,
    userTracking: false,
  })
  return state
}

function useLayout(
  props: Props,
  state: State,
  swiperContexts: Ref<SwiperContext[]>,
  slideFrameRef: Ref<HTMLElement | null>,
  emit: SetupContext['emit'],
  trigger: CustomEventTrigger
) {
  function cancelSchedule() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }
  let timer: number | null = null
  let invalid = true
  let viewportPosition = 0
  let viewportMoveRatio = 1
  let animating: null | {
    toPos: number
    acc: number
    endTime: number
    source: string
  } = null
  let requestedAnimation = false
  let contentTrackViewport = 0
  let transitionStart: number | null
  let currentChangeSource = ''
  let animationFrame: number
  const circularEnabled: ComputedRef<boolean> = computed(
    () =>
      props.circular && swiperContexts.value.length > state.displayMultipleItems
  )
  function checkCircularLayout(index: number) {
    if (!invalid) {
      for (
        let items = swiperContexts.value,
          n = items.length,
          i = index + state.displayMultipleItems,
          r = 0;
        r < n;
        r++
      ) {
        const item = items[r]
        const s = Math.floor(index / n) * n + r
        const l = s + n
        const c = s - n
        const u = Math.max(index - (s + 1), s - i, 0)
        const d = Math.max(index - (l + 1), l - i, 0)
        const h = Math.max(index - (c + 1), c - i, 0)
        const p = Math.min(u, d, h)
        const position = [s, l, c][[u, d, h].indexOf(p)]
        item.updatePosition(position, props.vertical)
      }
    }
  }
  function updateViewport(index: number) {
    if (
      !(
        Math.floor(2 * viewportPosition) === Math.floor(2 * index) &&
        Math.ceil(2 * viewportPosition) === Math.ceil(2 * index)
      )
    ) {
      if (circularEnabled.value) {
        checkCircularLayout(index)
      }
    }
    const x = props.vertical ? '0' : 100 * -index * viewportMoveRatio + '%'
    const y = props.vertical ? 100 * -index * viewportMoveRatio + '%' : '0'
    const transform = 'translate(' + x + ', ' + y + ') translateZ(0)'
    const slideFrame = slideFrameRef.value as HTMLElement
    if (slideFrame) {
      slideFrame.style.webkitTransform = transform
      slideFrame.style.transform = transform
    }
    viewportPosition = index
    if (!transitionStart) {
      if (index % 1 === 0) {
        return
      }
      transitionStart = index
    }
    index -= Math.floor(transitionStart)
    const items = swiperContexts.value
    if (index <= -(items.length - 1)) {
      index += items.length
    } else if (index >= items.length) {
      index -= items.length
    }
    index = transitionStart % 1 > 0.5 || transitionStart < 0 ? index - 1 : index
    trigger('transition', {} as Event, {
      dx: props.vertical ? 0 : index * slideFrame.offsetWidth,
      dy: props.vertical ? index * slideFrame.offsetHeight : 0,
    })
  }
  function endViewportAnimation() {
    if (animating) {
      updateViewport(animating.toPos)
      animating = null
    }
  }
  function normalizeCurrentValue(current: number) {
    const length = swiperContexts.value.length
    if (!length) {
      return -1
    }
    const index = ((Math.round(current) % length) + length) % length
    if (circularEnabled.value) {
      if (length <= state.displayMultipleItems) {
        return 0
      }
    } else if (index > length - state.displayMultipleItems) {
      return length - state.displayMultipleItems
    }
    return index
  }
  function cancelViewportAnimation() {
    animating = null
  }
  function animateFrameFuncProto() {
    if (!animating) {
      requestedAnimation = false
      return
    }
    const _animating = animating
    const toPos = _animating.toPos
    const acc = _animating.acc
    const endTime = _animating.endTime
    const source = _animating.source
    const time = endTime - Date.now()
    if (time <= 0) {
      updateViewport(toPos)
      animating = null
      requestedAnimation = false
      transitionStart = null
      const item = swiperContexts.value[state.current]
      if (item) {
        const currentItemId = item.getItemId()
        trigger('animationfinish', {} as Event, {
          current: state.current,
          currentItemId,
          source,
        })
      }
      return
    }
    const s = (acc * time * time) / 2
    const l = toPos + s
    updateViewport(l)
    animationFrame = requestAnimationFrame(animateFrameFuncProto)
  }
  function animateViewport(current: number, source: string, n: number) {
    cancelViewportAnimation()
    const duration = state.duration
    const length = swiperContexts.value.length
    let position = viewportPosition
    if (circularEnabled.value) {
      if (n < 0) {
        for (; position < current; ) {
          position += length
        }
        for (; position - length > current; ) {
          position -= length
        }
      } else if (n > 0) {
        for (; position > current; ) {
          position -= length
        }
        for (; position + length < current; ) {
          position += length
        }
      } else {
        for (; position + length < current; ) {
          position += length
        }
        for (; position - length > current; ) {
          position -= length
        }
        if (position + length - current < current - position) {
          position += length
        }
      }
    }

    animating = {
      toPos: current,
      acc: (2 * (position - current)) / (duration * duration),
      endTime: Date.now() + duration,
      source: source,
    }
    if (!requestedAnimation) {
      requestedAnimation = true
      animationFrame = requestAnimationFrame(animateFrameFuncProto)
    }
  }
  function scheduleAutoplay() {
    cancelSchedule()
    const items = swiperContexts.value
    const callback = function () {
      timer = null
      currentChangeSource = 'autoplay'
      if (circularEnabled.value) {
        state.current = normalizeCurrentValue(state.current + 1)
      } else {
        state.current =
          state.current + state.displayMultipleItems < items.length
            ? state.current + 1
            : 0
      }
      animateViewport(state.current, 'autoplay', circularEnabled.value ? 1 : 0)
      timer = setTimeout(callback, state.interval)
    }
    if (!(invalid || items.length <= state.displayMultipleItems)) {
      timer = setTimeout(callback, state.interval)
    }
  }
  function resetLayout() {
    cancelSchedule()
    endViewportAnimation()
    const items = swiperContexts.value
    for (let i = 0; i < items.length; i++) {
      items[i].updatePosition(i, props.vertical)
    }
    viewportMoveRatio = 1
    const slideFrameEl = slideFrameRef.value as HTMLElement
    if (state.displayMultipleItems === 1 && items.length) {
      const itemRect = items[0].getBoundingClientRect()
      const slideFrameRect = slideFrameEl.getBoundingClientRect()
      viewportMoveRatio = itemRect.width / slideFrameRect.width
      if (!(viewportMoveRatio > 0 && viewportMoveRatio < 1)) {
        viewportMoveRatio = 1
      }
    }
    const position = viewportPosition
    viewportPosition = -2
    const current = state.current
    if (current >= 0) {
      invalid = false
      if (state.userTracking) {
        updateViewport(position + current - contentTrackViewport)
        contentTrackViewport = current
      } else {
        updateViewport(current)
        if (props.autoplay) {
          scheduleAutoplay()
        }
      }
    } else {
      invalid = true
      updateViewport(-state.displayMultipleItems - 1)
    }
  }
  watch(
    [
      () => props.current,
      () => props.currentItemId,
      () => [...swiperContexts.value],
    ],
    () => {
      let current = -1
      if (props.currentItemId) {
        for (let i = 0, items = swiperContexts.value; i < items.length; i++) {
          const itemId = items[i].getItemId()
          if (itemId === props.currentItemId) {
            current = i
            break
          }
        }
      }
      if (current < 0) {
        current = Math.round(props.current) || 0
      }
      current = current < 0 ? 0 : current
      if (state.current !== current) {
        currentChangeSource = ''
        state.current = current
      }
    }
  )
  watch(
    [
      () => props.vertical,
      () => circularEnabled.value,
      () => state.displayMultipleItems,
      () => [...swiperContexts.value],
    ],
    resetLayout
  )
  watch(
    () => state.interval,
    () => {
      if (timer) {
        cancelSchedule()
        scheduleAutoplay()
      }
    }
  )
  function currentChanged(current: number, history: number) {
    const source = currentChangeSource
    currentChangeSource = ''
    const items = swiperContexts.value
    if (!source) {
      const length = items.length
      animateViewport(
        current,
        '',
        circularEnabled.value &&
          history + ((length - current) % length) > length / 2
          ? 1
          : 0
      )
    }
    const item = items[current]
    if (item) {
      const currentItemId = (state.currentItemId = item.getItemId())
      trigger('change', {} as Event, {
        current: state.current,
        currentItemId,
        source,
      })
    }
  }
  watch(
    () => state.current,
    (val, oldVal) => {
      currentChanged(val, oldVal)
      emit('update:current', val)
    }
  )
  watch(
    () => state.currentItemId,
    (val) => {
      emit('update:currentItemId', val)
    }
  )
  function inintAutoplay(enable: boolean) {
    if (enable) {
      scheduleAutoplay()
    } else {
      cancelSchedule()
    }
  }
  watch(() => props.autoplay && !state.userTracking, inintAutoplay)
  inintAutoplay(props.autoplay && !state.userTracking)

  onMounted(() => {
    let userDirectionChecked = false
    let contentTrackSpeed = 0
    let contentTrackT = 0
    function handleTrackStart() {
      cancelSchedule()
      contentTrackViewport = viewportPosition
      contentTrackSpeed = 0
      contentTrackT = Date.now()
      cancelViewportAnimation()
    }
    function handleTrackMove(data: {
      dy: number
      ddy: number
      dx: number
      ddx: number
    }) {
      const oldContentTrackT = contentTrackT
      contentTrackT = Date.now()
      const length = swiperContexts.value.length
      const other = length - state.displayMultipleItems
      function calc(val: number) {
        return 0.5 - 0.25 / (val + 0.5)
      }

      function move(oldVal: number, newVal: number) {
        let val = contentTrackViewport + oldVal
        contentTrackSpeed = 0.6 * contentTrackSpeed + 0.4 * newVal
        if (!circularEnabled.value) {
          if (val < 0 || val > other) {
            if (val < 0) {
              val = -calc(-val)
            } else {
              if (val > other) {
                val = other + calc(val - other)
              }
            }
            contentTrackSpeed = 0
          }
        }
        updateViewport(val)
      }
      const time = contentTrackT - oldContentTrackT || 1
      const slideFrameEl = slideFrameRef.value as HTMLElement
      if (props.vertical) {
        move(-data.dy / slideFrameEl.offsetHeight, -data.ddy / time)
      } else {
        move(-data.dx / slideFrameEl.offsetWidth, -data.ddx / time)
      }
    }
    function handleTrackEnd(isCancel: boolean) {
      state.userTracking = false
      const t = contentTrackSpeed / Math.abs(contentTrackSpeed)
      let n = 0
      if (!isCancel && Math.abs(contentTrackSpeed) > 0.2) {
        n = 0.5 * t
      }
      const current = normalizeCurrentValue(viewportPosition + n)
      if (isCancel) {
        updateViewport(contentTrackViewport)
      } else {
        currentChangeSource = 'touch'
        state.current = current
        animateViewport(
          current,
          'touch',
          n !== 0
            ? n
            : current === 0 && circularEnabled.value && viewportPosition >= 1
            ? 1
            : 0
        )
      }
    }
    useTouchtrack(slideFrameRef.value as HTMLElement, (event) => {
      if (props.disableTouch) {
        return
      }
      if (!invalid) {
        if (event.detail.state === 'start') {
          state.userTracking = true
          userDirectionChecked = false
          return handleTrackStart()
        }
        // fixed by xxxxxx
        if (event.detail.state === 'end') {
          return handleTrackEnd(false)
        }
        if (event.detail.state === 'cancel') {
          return handleTrackEnd(true)
        }
        if (state.userTracking) {
          if (!userDirectionChecked) {
            userDirectionChecked = true
            const t = Math.abs(event.detail.dx)
            const n = Math.abs(event.detail.dy)
            if (t >= n && props.vertical) {
              state.userTracking = false
            } else {
              if (t <= n && !props.vertical) {
                state.userTracking = false
              }
            }
            if (!state.userTracking) {
              if (props.autoplay) {
                scheduleAutoplay()
              }
              return
            }
          }
          handleTrackMove(event.detail)
          return false
        }
      }
    })
  })
  onUnmounted(() => {
    cancelSchedule()
    cancelAnimationFrame(animationFrame)
  })
  function onSwiperDotClick(index: number) {
    animateViewport(
      (state.current = index),
      (currentChangeSource = 'click'),
      circularEnabled.value ? 1 : 0
    )
  }
  return {
    onSwiperDotClick,
  }
}

export default /*#__PURE__*/ defineComponent({
  name: 'Swiper',
  props,
  emits: [
    'change',
    'transition',
    'animationfinish',
    'update:current',
    'update:currentItemId',
  ],
  setup(props, { slots, emit }) {
    const rootRef: Ref<HTMLElement | null> = ref(null)
    const trigger = useCustomEvent(rootRef, emit as SetupContext['emit'])
    const slidesWrapperRef: Ref<HTMLElement | null> = ref(null)
    const slideFrameRef: Ref<HTMLElement | null> = ref(null)
    const state = useState(props)
    const slidesStyle = computed(() => {
      let style = {}
      if (props.nextMargin || props.previousMargin) {
        style = props.vertical
          ? {
              left: 0,
              right: 0,
              top: upx2pxStr(props.previousMargin),
              bottom: upx2pxStr(props.nextMargin),
            }
          : {
              top: 0,
              bottom: 0,
              left: upx2pxStr(props.previousMargin),
              right: upx2pxStr(props.nextMargin),
            }
      }
      return style
    })
    const slideFrameStyle = computed(() => {
      const value = Math.abs(100 / state.displayMultipleItems) + '%'
      return {
        width: props.vertical ? '100%' : value,
        height: !props.vertical ? '100%' : value,
      }
    })
    let swiperItems: VNode[] = []
    const originSwiperContexts: SwiperContext[] = []
    const swiperContexts: Ref<SwiperContext[]> = ref([])
    function updateSwiperContexts() {
      const contexts: SwiperContext[] = []
      for (let index = 0; index < swiperItems.length; index++) {
        const swiperItem = swiperItems[index]
        const swiperContext = originSwiperContexts.find(
          (context) => swiperItem.el === context.rootRef.value
        )
        if (swiperContext) {
          contexts.push(markRaw(swiperContext))
        }
      }
      swiperContexts.value = contexts
    }
    const addSwiperContext: AddSwiperContext = function (swiperContext) {
      originSwiperContexts.push(swiperContext)
      updateSwiperContexts()
    }
    provide('addSwiperContext', addSwiperContext)
    const removeSwiperContext: RemoveSwiperContext = function (swiperContext) {
      const index = originSwiperContexts.indexOf(swiperContext)
      if (index >= 0) {
        originSwiperContexts.splice(index, 1)
        updateSwiperContexts()
      }
    }
    provide('removeSwiperContext', removeSwiperContext)

    const { onSwiperDotClick } = useLayout(
      props,
      state,
      swiperContexts,
      slideFrameRef,
      emit as SetupContext['emit'],
      trigger
    )

    return () => {
      const defaultSlots = slots.default && slots.default()
      // TODO filter
      swiperItems = flatVNode(defaultSlots)
      return (
        <uni-swiper ref={rootRef}>
          <div ref={slidesWrapperRef} class="uni-swiper-wrapper">
            <div class="uni-swiper-slides" style={slidesStyle.value}>
              <div
                ref={slideFrameRef}
                class="uni-swiper-slide-frame"
                style={slideFrameStyle.value}
              >
                {defaultSlots}
              </div>
            </div>
            {props.indicatorDots && (
              <div
                class={[
                  'uni-swiper-dots',
                  props.vertical
                    ? 'uni-swiper-dots-vertical'
                    : 'uni-swiper-dots-horizontal',
                ]}
              >
                {swiperContexts.value.map((_, index, array) => (
                  <div
                    onClick={() => onSwiperDotClick(index)}
                    class={{
                      'uni-swiper-dot': true,
                      'uni-swiper-dot-active':
                        (index < state.current + state.displayMultipleItems &&
                          index >= state.current) ||
                        index <
                          state.current +
                            state.displayMultipleItems -
                            array.length,
                    }}
                    style={{
                      background:
                        index === state.current
                          ? props.indicatorActiveColor
                          : props.indicatorColor,
                    }}
                  ></div>
                ))}
              </div>
            )}
          </div>
        </uni-swiper>
      )
    }
  },
})
