import mammoth from 'mammoth';
import { DocumentConverter, ConversionOptions, ConversionResult } from '../types/index';
import { HTMLConverter } from './html-converter';

export class WordConverter implements DocumentConverter {
  supportedInputTypes = ['docx', 'doc'];
  private htmlConverter: HTMLConverter;

  constructor() {
    this.htmlConverter = new HTMLConverter();
  }

  async convert(input: Buffer, options: ConversionOptions): Promise<ConversionResult> {
    try {
      const result = await mammoth.convertToHtml({ buffer: input }, {
        styleMap: [
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Heading 4'] => h4:fresh",
          "p[style-name='Heading 5'] => h5:fresh",
          "p[style-name='Heading 6'] => h6:fresh",
          "p[style-name='Code'] => pre:fresh",
          "r[style-name='Code Char'] => code",
          "p[style-name='Quote'] => blockquote:fresh"
        ],
        convertImage: mammoth.images.imgElement(image => {
          return image.read("base64").then(imageBuffer => {
            const extension = image.contentType?.split('/')[1] || 'png';
            const filename = `image_${Date.now()}.${extension}`;
            
            if (options.outputDir && options.extractImages) {
              return {
                src: `${options.outputDir}/${filename}`
              };
            }
            
            return {
              src: `data:${image.contentType};base64,${imageBuffer}`
            };
          });
        })
      });

      const warnings = result.messages.map(msg => msg.message);
      
      const conversionResult = await this.htmlConverter.convert(result.value, options);
      
      return {
        content: conversionResult.content,
        metadata: {
          title: conversionResult.metadata?.title,
          wordCount: conversionResult.metadata?.wordCount || 0,
          images: conversionResult.metadata?.images,
          warnings: warnings.length > 0 ? warnings : undefined
        }
      };
      
    } catch (error) {
      throw new Error(`Failed to convert Word document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}