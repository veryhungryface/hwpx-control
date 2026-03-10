import { FileParseResult } from '../../shared/types'
import { DEFAULTS } from '../../shared/constants'
import { readFileSync } from 'fs'
import path from 'path'
import pdf from 'pdf-parse'
import mammoth from 'mammoth'
import JSZip from 'jszip'

export class FileParserService {
  /**
   * 파일 경로를 받아 텍스트를 추출한다.
   * 확장자에 따라 적절한 파서를 선택.
   * 50,000자 초과 시 절단하고 truncated=true 반환.
   */
  async parse(filePath: string): Promise<FileParseResult> {
    const ext = path.extname(filePath).toLowerCase()

    let text: string

    switch (ext) {
      case '.pdf':
        text = await this.parsePdf(filePath)
        break
      case '.docx':
        text = await this.parseDocx(filePath)
        break
      case '.hwpx':
        text = await this.parseHwpx(filePath)
        break
      case '.txt':
      case '.csv':
      case '.md':
      case '.json':
      case '.xml':
        text = await this.parseText(filePath)
        break
      default:
        throw new Error(`지원하지 않는 파일 형식입니다: ${ext}`)
    }

    return this.truncate(text)
  }

  private async parsePdf(filePath: string): Promise<string> {
    const buffer = readFileSync(filePath)
    const data = await pdf(buffer)
    return data.text
  }

  private async parseDocx(filePath: string): Promise<string> {
    const result = await mammoth.extractRawText({ path: filePath })
    return result.value
  }

  private async parseHwpx(filePath: string): Promise<string> {
    const buffer = readFileSync(filePath)
    const zip = await JSZip.loadAsync(buffer)

    // Find all section files
    const sectionFiles = Object.keys(zip.files)
      .filter(name => name.startsWith('Contents/section') && name.endsWith('.xml'))
      .sort()

    let fullText = ''
    for (const sectionFile of sectionFiles) {
      const xml = await zip.files[sectionFile].async('text')
      // Extract text from <hp:t> tags
      const textMatches = xml.match(/<hp:t[^>]*>([^<]*)<\/hp:t>/g)
      if (textMatches) {
        for (const match of textMatches) {
          const text = match.replace(/<[^>]+>/g, '')
          fullText += text
        }
        fullText += '\n'
      }
    }

    return fullText
  }

  private async parseText(filePath: string): Promise<string> {
    return readFileSync(filePath, 'utf-8')
  }

  private truncate(text: string): FileParseResult {
    const originalLength = text.length
    if (originalLength > DEFAULTS.FILE_MAX_CHARS) {
      return {
        text: text.slice(0, DEFAULTS.FILE_MAX_CHARS),
        truncated: true,
        originalLength
      }
    }
    return {
      text,
      truncated: false,
      originalLength
    }
  }
}
