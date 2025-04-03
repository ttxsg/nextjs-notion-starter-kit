import * as React from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/router'

import cs from 'classnames'
import { PageBlock } from 'notion-types'
import { formatDate, getBlockTitle, getPageProperty } from 'notion-utils'
import BodyClassName from 'react-body-classname'
import { NotionRenderer } from 'react-notion-x'
import TweetEmbed from 'react-tweet-embed'
import { useSearchParam } from 'react-use'

import * as config from '@/lib/config'
import * as types from '@/lib/types'
import { mapImageUrl } from '@/lib/map-image-url'
import { getCanonicalPageUrl, mapPageUrl } from '@/lib/map-page-url'
import { searchNotion } from '@/lib/search-notion'
import { useDarkMode } from '@/lib/use-dark-mode'

import { Footer } from './Footer'
import { GitHubShareButton } from './GitHubShareButton'
import { Loading } from './Loading'
import { NotionPageHeader } from './NotionPageHeader'
import { Page404 } from './Page404'
import { PageAside } from './PageAside'
import { PageHead } from './PageHead'
import styles from './styles.module.css'
import { EncryptedBlock } from './EncryptedBlock'

// -----------------------------------------------------------------------------
// dynamic imports for optional components
// -----------------------------------------------------------------------------

const Code = dynamic(() =>
  import('react-notion-x/build/third-party/code').then(async (m) => {
    // add / remove any prism syntaxes here
    await Promise.allSettled([
      import('prismjs/components/prism-markup-templating.js'),
      import('prismjs/components/prism-markup.js'),
      import('prismjs/components/prism-bash.js'),
      import('prismjs/components/prism-c.js'),
      import('prismjs/components/prism-cpp.js'),
      import('prismjs/components/prism-csharp.js'),
      import('prismjs/components/prism-docker.js'),
      import('prismjs/components/prism-java.js'),
      import('prismjs/components/prism-js-templates.js'),
      import('prismjs/components/prism-coffeescript.js'),
      import('prismjs/components/prism-diff.js'),
      import('prismjs/components/prism-git.js'),
      import('prismjs/components/prism-go.js'),
      import('prismjs/components/prism-graphql.js'),
      import('prismjs/components/prism-handlebars.js'),
      import('prismjs/components/prism-less.js'),
      import('prismjs/components/prism-makefile.js'),
      import('prismjs/components/prism-markdown.js'),
      import('prismjs/components/prism-objectivec.js'),
      import('prismjs/components/prism-ocaml.js'),
      import('prismjs/components/prism-python.js'),
      import('prismjs/components/prism-reason.js'),
      import('prismjs/components/prism-rust.js'),
      import('prismjs/components/prism-sass.js'),
      import('prismjs/components/prism-scss.js'),
      import('prismjs/components/prism-solidity.js'),
      import('prismjs/components/prism-sql.js'),
      import('prismjs/components/prism-stylus.js'),
      import('prismjs/components/prism-swift.js'),
      import('prismjs/components/prism-wasm.js'),
      import('prismjs/components/prism-yaml.js')
    ])
    return m.Code
  })
)

const Collection = dynamic(() =>
  import('react-notion-x/build/third-party/collection').then(
    (m) => m.Collection
  )
)
const Equation = dynamic(() =>
  import('react-notion-x/build/third-party/equation').then((m) => m.Equation)
)
const Pdf = dynamic(
  () => import('react-notion-x/build/third-party/pdf').then((m) => m.Pdf),
  {
    ssr: false
  }
)
const Modal = dynamic(
  () =>
    import('react-notion-x/build/third-party/modal').then((m) => {
      m.Modal.setAppElement('.notion-viewport')
      return m.Modal
    }),
  {
    ssr: false
  }
)

const Tweet = ({ id }: { id: string }) => {
  return <TweetEmbed tweetId={id} />
}

const propertyLastEditedTimeValue = (
  { block, pageHeader },
  defaultFn: () => React.ReactNode
) => {
  if (pageHeader && block?.last_edited_time) {
    return `Last updated ${formatDate(block?.last_edited_time, {
      month: 'long'
    })}`
  }

  return defaultFn()
}

const propertyDateValue = (
  { data, schema, pageHeader },
  defaultFn: () => React.ReactNode
) => {
  if (pageHeader && schema?.name?.toLowerCase() === 'published') {
    const publishDate = data?.[0]?.[1]?.[0]?.[1]?.start_date

    if (publishDate) {
      return `${formatDate(publishDate, {
        month: 'long'
      })}`
    }
  }

  return defaultFn()
}

const propertyTextValue = (
  { schema, pageHeader },
  defaultFn: () => React.ReactNode
) => {
  if (pageHeader && schema?.name?.toLowerCase() === 'author') {
    return <b>{defaultFn()}</b>
  }

  return defaultFn()
}

// 统一处理加密内容检测的函数
function processBlockForEncryption(block, blockType) {
  if (!block?.properties?.title) return null;
  
  try {
    // 获取文本内容
    let fullText = '';
    if (Array.isArray(block.properties.title)) {
      fullText = block.properties.title
        .map(segment => (Array.isArray(segment) ? segment[0] : segment))
        .join('');
    }
    
    // 移除前后空白
    fullText = fullText.trim();
    
    console.log(`检查${blockType}块:`, fullText, block.id);
    
    // 使用更宽松的匹配模式
    // 匹配 {{password:...}}... 格式
    if (fullText.includes('{{password:')) {
      const match = fullText.match(/\{\{password:(.*?)\}\}(.*)/);
      if (match) {
        const password = match[1].trim();
        const content = match[2].trim();
        console.log(`找到password格式: 密码=${password}, 内容=${content}`);
        return <EncryptedBlock content={content} password={password} />;
      }
    }
    
    // 匹配 {{encrypted:...}} 格式
    if (fullText.includes('{{encrypted:')) {
      const match = fullText.match(/\{\{encrypted:(.*?)\}\}/);
      if (match) {
        const content = match[1].trim();
        console.log(`找到encrypted格式: 内容=${content}`);
        return <EncryptedBlock content={content} />;
      }
    }
  } catch (e) {
    console.error(`处理${blockType}块错误:`, e);
  }
  
  return null;
}

// 代码块特殊处理函数
function processCodeBlockForEncryption(block) {
  try {
    // 检查是否有代码内容
    if (!block?.properties?.title) return null;
    
    // 获取代码内容
    let codeContent = '';
    if (Array.isArray(block.properties.title)) {
      codeContent = block.properties.title
        .map(segment => (Array.isArray(segment) ? segment[0] : segment))
        .join('');
    }
    
    // 移除前后空白
    codeContent = codeContent.trim();
    
    console.log(`检查代码块:`, codeContent, block.id);
    
    // 检查代码内容是否包含加密标记
    if (codeContent.includes('{{encrypted:')) {
      const match = codeContent.match(/\{\{encrypted:(.*?)\}\}/);
      if (match) {
        const content = match[1].trim();
        console.log(`代码块中找到加密内容: ${content}`);
        return <EncryptedBlock content={content} />;
      }
    }
    
    if (codeContent.includes('{{password:')) {
      const match = codeContent.match(/\{\{password:(.*?)\}\}(.*)/);
      if (match) {
        const password = match[1].trim();
        const content = match[2].trim();
        console.log(`代码块中找到密码保护内容: 密码=${password}, 内容=${content}`);
        return <EncryptedBlock content={content} password={password} />;
      }
    }
  } catch (e) {
    console.error('处理代码块错误:', e);
  }
  
  return null;
}

export const NotionPage: React.FC<types.PageProps> = ({
  site,
  recordMap,
  error,
  pageId
}) => {
  const router = useRouter()
  const lite = useSearchParam('lite')

  const components = React.useMemo(
    () => ({
      nextImage: Image,
      nextLink: Link,
      Code: (props) => {
        // 先检查是否包含加密内容
        const encryptedContent = processCodeBlockForEncryption(props.block);
        if (encryptedContent) return encryptedContent;
        
        // 否则使用默认的代码渲染器
        return <Code {...props} />;
      },
      Collection,
      Equation,
      Pdf,
      Modal,
      Tweet,
      Header: NotionPageHeader,
      propertyLastEditedTimeValue,
      propertyTextValue,
      propertyDateValue,
      
      // 处理文本块
      text: ({ block }) => {
        return processBlockForEncryption(block, 'text');
      },
      
      // 处理引用块
      quote: ({ block }) => {
        return processBlockForEncryption(block, 'quote');
      },
      
      // 处理项目符号列表
      bulleted_list: ({ block }) => {
        return processBlockForEncryption(block, 'bulleted_list');
      },
      
      // 处理编号列表
      numbered_list: ({ block }) => {
        return processBlockForEncryption(block, 'numbered_list');
      },
      
      // 处理标题块
      header: ({ block }) => {
        return processBlockForEncryption(block, 'header');
      },
      
      sub_header: ({ block }) => {
        return processBlockForEncryption(block, 'sub_header');
      },
      
      sub_sub_header: ({ block }) => {
        return processBlockForEncryption(block, 'sub_sub_header');
      },
      
      // 处理callout块 (带有图标的侧边块)
      callout: ({ block }) => {
        return processBlockForEncryption(block, 'callout');
      },
      
      // 处理toggle块
      toggle: ({ block }) => {
        return processBlockForEncryption(block, 'toggle');
      }
    }),
    []
  )

  // lite mode is for oembed
  const isLiteMode = lite === 'true'

  const { isDarkMode } = useDarkMode()

  const siteMapPageUrl = React.useMemo(() => {
    const params: any = {}
    if (lite) params.lite = lite

    const searchParams = new URLSearchParams(params)
    return mapPageUrl(site, recordMap, searchParams)
  }, [site, recordMap, lite])

  const keys = Object.keys(recordMap?.block || {})
  const block = recordMap?.block?.[keys[0]]?.value

  // const isRootPage =
  //   parsePageId(block?.id) === parsePageId(site?.rootNotionPageId)
  const isBlogPost =
    block?.type === 'page' && block?.parent_table === 'collection'

  const showTableOfContents = !!isBlogPost
  const minTableOfContentsItems = 3

  const pageAside = React.useMemo(
    () => (
      <PageAside block={block} recordMap={recordMap} isBlogPost={isBlogPost} />
    ),
    [block, recordMap, isBlogPost]
  )

  const footer = React.useMemo(() => <Footer />, [])

  if (router.isFallback) {
    return <Loading />
  }

  if (error || !site || !block) {
    return <Page404 site={site} pageId={pageId} error={error} />
  }

  const title = getBlockTitle(block, recordMap) || site.name

  console.log('notion page', {
    isDev: config.isDev,
    title,
    pageId,
    rootNotionPageId: site.rootNotionPageId,
    recordMap
  })

  if (!config.isServer) {
    // add important objects to the window global for easy debugging
    const g = window as any
    g.pageId = pageId
    g.recordMap = recordMap
    g.block = block
  }

  const canonicalPageUrl =
    !config.isDev && getCanonicalPageUrl(site, recordMap)(pageId)

  const socialImage = mapImageUrl(
    getPageProperty<string>('Social Image', block, recordMap) ||
      (block as PageBlock).format?.page_cover ||
      config.defaultPageCover,
    block
  )

  const socialDescription =
    getPageProperty<string>('Description', block, recordMap) ||
    config.description

  return (
    <>
      <PageHead
        pageId={pageId}
        site={site}
        title={title}
        description={socialDescription}
        image={socialImage}
        url={canonicalPageUrl}
      />

      {isLiteMode && <BodyClassName className='notion-lite' />}
      {isDarkMode && <BodyClassName className='dark-mode' />}

      <NotionRenderer
        bodyClassName={cs(
          styles.notion,
          pageId === site.rootNotionPageId && 'index-page'
        )}
        darkMode={isDarkMode}
        components={components}
        recordMap={recordMap}
        rootPageId={site.rootNotionPageId}
        rootDomain={site.domain}
        fullPage={!isLiteMode}
        previewImages={!!recordMap.preview_images}
        showCollectionViewDropdown={false}
        showTableOfContents={showTableOfContents}
        minTableOfContentsItems={minTableOfContentsItems}
        defaultPageIcon={config.defaultPageIcon}
        defaultPageCover={config.defaultPageCover}
        defaultPageCoverPosition={config.defaultPageCoverPosition}
        mapPageUrl={siteMapPageUrl}
        mapImageUrl={mapImageUrl}
        searchNotion={config.isSearchEnabled ? searchNotion : null}
        pageAside={pageAside}
        footer={footer}
      />

      <GitHubShareButton />
    </>
  )
}
