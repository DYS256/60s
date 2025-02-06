import { wrapperBaseRes, transferText } from '../utils.ts'

import type { Context } from '@oak/oak'

interface Item {
  result: string[]
  title_image: string
  updated: number
  url: string
}

const cache: Map<string, Item> = new Map()

const itemReg = /<p\s+data-pid=[^<>]+>([^<>]+)<\/p>/g
const tagReg = /<[^<>]+>/g

function getLocaleTodayString(timestamp = Date.now(), locale = 'zh-CN', timeZone = 'Asia/Shanghai') {
  const today = new Date(timestamp)

  const formatter = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  })

  return formatter.format(today)
}

function getLocaleTimeString(timestamp = Date.now(), locale = 'zh-CN', timeZone = 'Asia/Shanghai') {
  const today = new Date(timestamp)

  const formatter = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone,
  })

  return formatter.format(today)
}

export async function fetch60s(type: string, ctx: Context) {
  const isV2 = !!ctx.request.url.searchParams.get('v2')
  const today = getLocaleTodayString()

  const ZHIHU_CK = globalThis.env?.ZHIHU_CK ?? ''

  console.log('ZHIHU_CK', ZHIHU_CK)

  let returnData: Item | undefined = cache.get(today)

  if (!returnData) {
    const ZHIHU_CK = globalThis.env?.ZHIHU_CK ?? ''

    const api = 'https://www.zhihu.com/people/98-18-69-57/posts'
    const response = await fetch(api, {
      headers: {
        Cookie: ZHIHU_CK,
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
      },
    })

    const html = await response.text()

    const initialData = JSON.parse(
      /<script id="js-initialData" type="text\/json">(.+?)<\/script>/.exec(html)?.[1] || '{}',
    )

    const data = (Object.values(initialData?.initialState?.entities?.articles || {})[0] || {}) as any

    const { content = '', url = '', title_image = '', updated = 0 } = data || {}

    const contents: string[] = content.match(itemReg) ?? []

    const result = contents.map((e: string) => {
      return transferText(e.replace(tagReg, '').trim(), 'a2u')
    })

    const todayInData = getLocaleTodayString(updated * 1000)
    const itemData = { url, result, title_image, updated: updated * 1000 }

    if (result.length && todayInData === today) {
      cache.set(today, itemData)
    }

    returnData = itemData
  }

  const finalList = (returnData?.result || []).filter((e) => e.length > 3)

  if (!isV2) {
    if (type === 'json') {
      return wrapperBaseRes(finalList)
    }

    return finalList.join('\n')
  }

  const news = finalList
    .map((e) => {
      return e
        .replace(/^\d+、\s*/g, '')
        .replace(/。$/, '')
        .trim()
    })
    .filter(Boolean)

  let tip = ''

  const tipIdx = news.findIndex((e) => e.includes('微语'))

  if (tipIdx !== -1) {
    tip = news[tipIdx].replace(/【微语】/, '')
    news.splice(tipIdx, 1)
  }

  if (type === 'json') {
    return wrapperBaseRes({
      news,
      tip,
      updated: returnData?.updated ?? 0,
      updatedAt: (returnData?.updated ?? 0) / 1000,
      sourceUpdatedDate: getLocaleTimeString(returnData?.updated ?? new Date().getTime()),
      apiUpdateDate: getLocaleTimeString(new Date().getTime()),
      url: returnData?.url ?? '',
      cover: returnData?.title_image ?? '',
    })
  }

  return news.map((e, idx) => `${idx + 1}. ${e}`).join('\n') + (tip ? `\n\n微语：${tip}` : '')
}
