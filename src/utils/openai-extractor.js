import OpenAI from 'openai';
import * as cheerio from 'cheerio';
import { Actor } from 'apify';

const log = Actor.log;

let openaiClient = null;

/**
 * Initialise le client OpenAI
 */
function getOpenAIClient() {
  if (!openaiClient) {
    const apiKey = Actor.getEnv()?.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not found in environment variables');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

/**
 * Nettoie le HTML pour ne garder que le texte pertinent
 */
function cleanHtmlForAnalysis(html) {
  const $ = cheerio.load(html);
  
  // Supprime scripts, styles, noscript, formulaires
  $('script, style, noscript, iframe, embed, form').remove();
  
  // Garde seulement le contenu principal
  const mainContent = $('main, article, .content, .main-content, body').first();
  if (mainContent.length > 0) {
    return mainContent.text().trim();
  }
  
  return $('body').text().trim();
}

/**
 * Extrait les données via OpenAI depuis le texte d'une page
 */
export async function extractWithOpenAI(html, sourceUrl, pageType = 'general', model = 'gpt-4o-mini') {
  try {
    const client = getOpenAIClient();
    const cleanText = cleanHtmlForAnalysis(html);
    
    // Limite à 12000 caractères pour éviter les coûts excessifs
    const textToAnalyze = cleanText.length > 12000 
      ? cleanText.substring(0, 12000) + '...' 
      : cleanText;
    
    // Détermine le prompt selon le type de page
    let systemPrompt, userPrompt;
    
    if (pageType === 'legal' || pageType === 'contact') {
      // Page légale ou contact : focus sur company + address
      systemPrompt = `You are an expert at extracting structured company information from web pages. 
Extract ONLY the following information in valid JSON format:
- company.name: The company's display name (not legal name)
- company.legalName: The official legal name (e.g., "SARL X", "SAS Y", "LTD Z", "HORIZON SOFTWARE SAS")
- company.address.street: Street address (number + street name, e.g., "60 rue de Monceau")
- company.address.postalCode: Postal/ZIP code (5 digits typically, e.g., "75008")
- company.address.city: City name (e.g., "Paris")
- company.address.country: ISO country code (FR, GB, US, etc.)
- company.address.countryName: Full country name (e.g., "France")

Return ONLY valid JSON, no explanations. If a field is not found, use null.`;
        
      userPrompt = `Extract company information from this page (URL: ${sourceUrl}):

${textToAnalyze}

Return JSON in this exact format:
{
  "company": {
    "name": "string or null",
    "legalName": "string or null",
    "address": {
      "street": "string or null",
      "postalCode": "string or null",
      "city": "string or null",
      "country": "string or null",
      "countryName": "string or null"
    }
  }
}`;
    } else if (pageType === 'team') {
      // Page team : focus sur les membres
      systemPrompt = `You are an expert at extracting team member information from web pages.
Extract a list of team members with their names, roles, and LinkedIn profiles.
Ignore section titles like "Leadership", "Sales & Marketing", "Company Support Department", etc.
Only extract actual people with real names (First Name + Last Name pattern).
Each person should be a separate object. Do not group multiple names together.
Return ONLY valid JSON object format with a "team" array.`;
        
      userPrompt = `Extract team members from this page (URL: ${sourceUrl}):

${textToAnalyze}

Return JSON object in this exact format:
{
  "team": [
    {
      "name": "Full Name (First Last)",
      "role": "Job Title or null",
      "linkedin": "https://linkedin.com/in/username or null"
    }
  ]
}

Each person should be a separate object in the team array. Extract all team members you can find.`;
    } else {
      // Page générale : extrait tout
      systemPrompt = `You are an expert at extracting structured company information from web pages.
Extract company name, legal name, address, and team members if present.
Return ONLY valid JSON format.`;
        
      userPrompt = `Extract company information from this page (URL: ${sourceUrl}):

${textToAnalyze}

Return JSON in this exact format:
{
  "company": {
    "name": "string or null",
    "legalName": "string or null",
    "address": {
      "street": "string or null",
      "postalCode": "string or null",
      "city": "string or null",
      "country": "string or null",
      "countryName": "string or null"
    }
  },
  "team": [
    {
      "name": "Full Name",
      "role": "Job Title or null",
      "linkedin": "https://linkedin.com/in/username or null"
    }
  ]
}`;
    }
    
    const response = await client.chat.completions.create({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1, // Basse température pour plus de précision
      max_tokens: 2000
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      log.warning(`OpenAI returned empty response for ${sourceUrl}`);
      return null;
    }
    
    // Parse le JSON
    try {
      const parsed = JSON.parse(content);
      log.info(`OpenAI successfully extracted data from ${sourceUrl} (pageType: ${pageType})`);
      return parsed;
    } catch (parseError) {
      log.error(`Failed to parse OpenAI response for ${sourceUrl}: ${parseError.message}`);
      // Tentative de récupération du JSON depuis le texte
      const jsonMatch = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (e) {
          log.error(`Failed to extract JSON from OpenAI response`);
          return null;
        }
      }
      return null;
    }
    
  } catch (error) {
    if (error.message.includes('API key') || error.message.includes('OPENAI_API_KEY')) {
      log.error(`OpenAI API key error: ${error.message}`);
    } else {
      log.error(`OpenAI extraction failed for ${sourceUrl}: ${error.message}`);
    }
    return null;
  }
}
