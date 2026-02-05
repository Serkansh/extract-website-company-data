import { ApifyClient } from 'apify-client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RESULTS_FILE = path.join(__dirname, 'test-results-final.json');

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const ACTOR_ID = process.env.ACTOR_ID || 'smart-digital/extract-website-company-data-email-phone-social';

if (!APIFY_TOKEN) {
  console.error('❌ APIFY_TOKEN environment variable is required');
  process.exit(1);
}

const TEST_SITES = [
  'http://www.hotel-leliondor.fr/',
  'https://hotellittreparis.com/fr/',
  'https://www.lodgepark.com/fr',
  'https://www.hotel-le-louvre-cherbourg.com/',
  'https://www.lumierehotel.fr/',
  'https://hotelmparis.com/fr/',
  'http://www.hotelmagellan.com',
];

async function runTest(client, url) {
  const domain = new URL(url).hostname.replace(/^www\./, '');
  console.log(`\n📤 Test de: ${url}`);
  try {
    const run = await client.actor(ACTOR_ID).start({
      startUrls: [{ url }],
      timeoutSecs: 60,
      usePlaywrightFallback: true,
      includeContacts: true,
      includeSocials: true,
    });

    console.log(`   ⏳ Run lancé: ${run.id}`);
    const finishedRun = await client.run(run.id).waitForFinish({ waitSecs: 300 });

    if (finishedRun.status !== 'SUCCEEDED') {
      return { url, status: 'failed', error: `Run failed with status: ${finishedRun.status}` };
    }

    const { items } = await client.dataset(finishedRun.defaultDatasetId).listItems();
    const data = items[0] || null;

    const issues = [];
    
    // Vérifie que company n'est PAS présent
    if (data?.company) {
      issues.push({ severity: 'high', type: 'company_present', message: 'Le champ company ne devrait pas être présent' });
    }
    
    // Vérifie les contacts
    if (!data?.emails || data.emails.length === 0) {
      issues.push({ severity: 'medium', type: 'missing_emails', message: 'Aucun email trouvé' });
    }
    if (!data?.phones || data.phones.length === 0) {
      issues.push({ severity: 'medium', type: 'missing_phones', message: 'Aucun téléphone trouvé' });
    }
    
    // Vérifie les emails dupliqués (même domaine, variantes .fr/.com)
    if (data?.emails) {
      const emailMap = new Map();
      for (const email of data.emails) {
        const [local, domain] = email.value.split('@');
        const key = `${local}@${domain}`;
        const variants = [`${local}@${domain.replace(/\.fr$/, '.com')}`, `${local}@${domain.replace(/\.com$/, '.fr')}`];
        for (const variant of variants) {
          if (emailMap.has(variant) && variant !== key) {
            issues.push({ severity: 'medium', type: 'duplicate_email_variant', message: `Emails dupliqués détectés: ${email.value} et ${emailMap.get(variant)}` });
          }
        }
        emailMap.set(key, email.value);
      }
    }
    
    // Vérifie les faux numéros RCS/SIRET
    if (data?.phones) {
      for (const phone of data.phones) {
        const digits = phone.valueRaw?.replace(/\D/g, '') || '';
        if (digits.length === 9) {
          const snippet = phone.snippet?.toLowerCase() || '';
          if (/(rcs|siret|siren|immatricul|registre|commerce|soci[eé]t[eé]s?)/i.test(snippet)) {
            issues.push({ severity: 'high', type: 'rcs_as_phone', message: `Numéro RCS détecté comme téléphone: ${phone.valueRaw}` });
          }
        }
        // Vérifie les coordonnées GPS
        if (phone.valueRaw && /^\d+\.\d+$/.test(phone.valueRaw)) {
          const snippet = phone.snippet?.toLowerCase() || '';
          if (/(latitude|longitude|lat|lon|coord|gps|position)/i.test(snippet)) {
            issues.push({ severity: 'high', type: 'gps_as_phone', message: `Coordonnée GPS détectée comme téléphone: ${phone.valueRaw}` });
          }
        }
      }
    }
    
    // Vérifie les emails avec préfixes numériques
    if (data?.emails) {
      for (const email of data.emails) {
        if (/^\d+[a-z]/.test(email.value)) {
          issues.push({ severity: 'high', type: 'email_with_numeric_prefix', message: `Email avec préfixe numérique: ${email.value}` });
        }
      }
    }
    
    // Vérifie les fax détectés comme téléphones
    if (data?.phones) {
      for (const phone of data.phones) {
        const snippet = phone.snippet?.toLowerCase() || '';
        if (/(fax|télécopie|facsimile)\s*[=:]\s*/i.test(snippet)) {
          issues.push({ severity: 'high', type: 'fax_as_phone', message: `Fax détecté comme téléphone: ${phone.valueRaw}` });
        }
      }
    }
    
    // Vérifie les liens sociaux de policies/settings
    if (data?.socials) {
      for (const [platform, links] of Object.entries(data.socials)) {
        for (const link of links) {
          const url = link.url?.toLowerCase() || '';
          if (/(policies|settings|help|rules|terms|privacy|legal|cookies|ads|account)/.test(url)) {
            issues.push({ severity: 'medium', type: 'social_policy_link', message: `Lien social de paramètres détecté: ${link.url}` });
          }
        }
      }
    }

    return { url, status: 'success', data, issues };

  } catch (error) {
    return { url, status: 'error', error: error.message };
  }
}

async function main() {
  const client = new ApifyClient({ token: APIFY_TOKEN });
  const allResults = [];

  console.log('🚀 Démarrage des tests sur les nouveaux hôtels...');
  console.log(`📋 ${TEST_SITES.length} site(s) à tester\n`);

  for (let i = 0; i < TEST_SITES.length; i++) {
    const url = TEST_SITES[i];
    console.log(`[${i + 1}/${TEST_SITES.length}]\n`);
    const result = await runTest(client, url);
    allResults.push(result);
  }

  fs.writeFileSync(RESULTS_FILE, JSON.stringify(allResults, null, 2));

  console.log('\n================================================================================');
  console.log('📊 RÉSUMÉ DES TESTS');
  console.log('================================================================================');

  const successful = allResults.filter(r => r.status === 'success' && r.issues.length === 0).length;
  const minorIssues = allResults.filter(r => r.status === 'success' && r.issues.length > 0).length;
  const failed = allResults.filter(r => r.status === 'failed' || r.status === 'error').length;

  console.log(`\n✅ Sites sans problème: ${successful}/${TEST_SITES.length}`);
  console.log(`⚠️  Sites avec problèmes: ${minorIssues}/${TEST_SITES.length}`);
  console.log(`❌ Sites en échec: ${failed}/${TEST_SITES.length}`);

  console.log('\n--------------------------------------------------------------------------------');
  console.log('DÉTAILS PAR SITE:');
  console.log('--------------------------------------------------------------------------------');

  for (const result of allResults) {
    const domain = new URL(result.url).hostname.replace(/^www\./, '');
    console.log(`\n🌐 ${domain}`);
    console.log(`   URL: ${result.url}`);
    if (result.status === 'success') {
      if (result.issues.length === 0) {
        console.log('   ✅ Aucun problème détecté');
      } else {
        console.log(`   ⚠️  ${result.issues.length} problème(s) détecté(s):`);
        result.issues.forEach((issue, idx) => {
          const emoji = issue.severity === 'high' ? '🔴' : issue.severity === 'medium' ? '🟡' : '🟢';
          console.log(`      ${idx + 1}. ${emoji} [${issue.severity?.toUpperCase() || 'UNKNOWN'}] ${issue.message}`);
        });
      }
      console.log('   📋 Données extraites:');
      if (result.data?.company) {
        console.log(`      - ⚠️  COMPANY PRÉSENT (ne devrait pas l'être): ${JSON.stringify(result.data.company)}`);
      }
      console.log(`      - Emails: ${result.data?.emails?.length || 0}`);
      if (result.data?.emails?.length > 0) {
        const primary = result.data.emails.find(e => e.priority === 'primary');
        console.log(`        Primary: ${primary?.value || 'N/A'}`);
        // Affiche tous les emails pour vérifier les doublons
        result.data.emails.forEach(e => {
          console.log(`        - ${e.value} (${e.priority})`);
        });
      }
      console.log(`      - Phones: ${result.data?.phones?.length || 0}`);
      if (result.data?.phones?.length > 0) {
        const primary = result.data.phones.find(p => p.priority === 'primary');
        console.log(`        Primary: ${primary?.valueE164 || primary?.valueRaw || 'N/A'}`);
      }
      console.log(`      - Socials: ${Object.values(result.data?.socials || {}).flat().length || 0}`);
      if (result.data?.socials) {
        for (const [platform, links] of Object.entries(result.data.socials)) {
          if (links.length > 0) {
            console.log(`        ${platform}: ${links.map(l => l.url).join(', ')}`);
          }
        }
      }
      console.log(`      - Pages visitées: ${result.data?.pagesVisited?.length || 0}`);
    } else {
      console.log(`   ❌ Échec du test: ${result.error}`);
    }
  }

  console.log('\n================================================================================');
  console.log(`\n💾 Résultats sauvegardés dans: ${RESULTS_FILE}`);
}

main().catch(console.error);
