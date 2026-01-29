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
    if (!html || typeof html !== 'string') {
      log.warning(`Invalid HTML provided for OpenAI extraction: ${sourceUrl}`);
      return null;
    }
    const cleanText = cleanHtmlForAnalysis(html);
    
    // Limite à 15000 caractères pour donner plus de contexte à l'IA
    const textToAnalyze = cleanText.length > 15000 
      ? cleanText.substring(0, 15000) + '...' 
      : cleanText;
    
    if (textToAnalyze.length < 100) {
      log.warning(`Not enough text content for OpenAI analysis: ${sourceUrl} (${textToAnalyze.length} chars)`);
      return null;
    }
    
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
- company.address.country: ISO country code (FR, GB, US, etc.) - MUST be extracted from context (e.g., "Paris, France" = FR, "London, UK" = GB)
- company.address.countryName: Full country name (e.g., "France", "United Kingdom")

IMPORTANT: 
- If you see an address like "60 rue de Monceau 75008 Paris", the country is FRANCE (FR) because Paris is in France
- If you see "Paris" or "France" mentioned anywhere near the address, extract the country
- Always try to infer the country from the city name or context, even if not explicitly stated
- For French addresses, country is usually FR unless stated otherwise

Return ONLY valid JSON, no explanations. If a field is not found, use null.`;
        
      userPrompt = `Analyze this web page content and extract company information. Be very thorough and extract ALL available information.

Page URL: ${sourceUrl}

Page content:
${textToAnalyze}

CRITICAL INSTRUCTIONS:
1. Extract the country from context - this is ESSENTIAL:
   - "Paris" or "75008" = FR, "France"
   - "London" or postal codes starting with letters = GB, "United Kingdom"
   - "New York" or US zip codes = US, "United States"
   - Look for country names, postal code patterns, phone country codes (+33=FR, +44=GB, +1=US)
   - If you see a city name, infer the country from common knowledge

2. Extract the FULL legal name including company type (SARL, SAS, LTD, Inc., etc.)

3. Extract the COMPLETE address including street number, street name, postal code, city, and country

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
}

IMPORTANT: You MUST extract the country. If you see "Paris" or "75008", the country is "FR" and countryName is "France". Never leave country as null if you have a city or postal code.`;
    } else if (pageType === 'team') {
      // Page team : focus sur les membres
      systemPrompt = `You are an expert at extracting team member information from web pages.
Extract ONLY actual people with real names (First Name + Last Name pattern).

CRITICAL FILTERING RULES:
- IGNORE: Section titles like "Leadership", "Sales & Marketing", "Company Support Department", "Product & Engineering"
- IGNORE: Button labels like "Send Message", "Contact Us", "View Profile"
- IGNORE: Company names, product names, or service names (e.g., "Horizon Extend", "Horizon Trading Solutions")
- IGNORE: Generic text like "Our Team", "Meet the Team", "About Us"
- IGNORE: Single words that are not names (e.g., "Marketing", "Sales", "Support")
- EXTRACT ONLY: Real people with first and last names (e.g., "John Smith", "Marie Dupont", "Sylvain Thieullent")
- Each person should be a separate object. Do not group multiple names together.

Return ONLY valid JSON object format with a "team" array.`;
        
      userPrompt = `Analyze this web page and extract ONLY real team members (actual people with names).

Page URL: ${sourceUrl}

Page content:
${textToAnalyze}

CRITICAL FILTERING:
- EXTRACT: Real people with first name + last name (e.g., "John Smith", "Marie Dupont", "Sylvain Thieullent")
- IGNORE: Section titles ("Leadership", "Sales & Marketing", "Product & Engineering")
- IGNORE: Button labels ("Send Message", "Contact Us", "View Profile")
- IGNORE: Company/product names ("Horizon Extend", "Horizon Trading Solutions")
- IGNORE: Generic text ("Our Team", "Meet the Team", "About Us")
- IGNORE: Single words that are not names ("Marketing", "Sales", "Support")

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

IMPORTANT: 
- Extract ALL real people you can find on this page
- Each person must be a separate object
- Only include people with both first and last names
- Extract their job titles/roles if mentioned
- Extract LinkedIn URLs if present`;
    } else if (pageType === 'phones') {
      // Extraction des téléphones avec leurs emplacements
      systemPrompt = `You are an expert at extracting phone numbers with their office locations from web pages.
Extract phone numbers and associate them with their office locations (city, country).

Return ONLY valid JSON format with a "phones" array. Each phone should have:
- phone: The phone number in E.164 format if possible (e.g., "+33142605126")
- location: The office location (e.g., "Paris, France", "Dubai, UAE", "Hong Kong")
- city: City name (e.g., "Paris", "Dubai", "Hong Kong")
- country: ISO country code (e.g., "FR", "AE", "HK")
- countryName: Full country name (e.g., "France", "United Arab Emirates", "Hong Kong")`;
        
      userPrompt = `Extract phone numbers with their office locations from this page (URL: ${sourceUrl}):

${textToAnalyze}

Return JSON in this exact format:
{
  "phones": [
    {
      "phone": "+33142605126",
      "location": "Paris, France",
      "city": "Paris",
      "country": "FR",
      "countryName": "France"
    }
  ]
}

IMPORTANT: 
- Associate each phone number with its office location based on context
- If you see "Paris 60 rue de Monceau 75008 Paris Phone: +33(0)1 42 60 94 90", the phone is in Paris, France
- If you see "Dubai Phone: +971-586239345", the phone is in Dubai, UAE
- Extract all phone numbers with their locations`;
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
    
    // Vérifie que la réponse est valide
    if (!response || !response.choices || !Array.isArray(response.choices) || response.choices.length === 0) {
      log.warning(`OpenAI returned invalid response structure for ${sourceUrl}`);
      return null;
    }
    
    // Vérifie s'il y a une erreur dans la réponse
    if (response.error) {
      log.warning(`OpenAI API error for ${sourceUrl}: ${response.error.message || JSON.stringify(response.error)}`);
      return null;
    }
    
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
    // Gère les erreurs de manière sécurisée - ne bloque jamais le crawl
    let errorMessage = 'Unknown error';
    
    try {
      if (error && typeof error === 'object') {
        errorMessage = error.message || error.error?.message || error.toString();
      } else if (error) {
        errorMessage = String(error);
      }
    } catch (e) {
      errorMessage = 'Error object could not be stringified';
    }
    
    // Log en warning (pas error) pour ne pas bloquer le crawl
    if (errorMessage.includes('API key') || errorMessage.includes('OPENAI_API_KEY')) {
      log.warning(`OpenAI API key error: ${errorMessage}`);
    } else {
      log.warning(`OpenAI extraction failed for ${sourceUrl}: ${errorMessage}`);
    }
    return null;
  }
}
