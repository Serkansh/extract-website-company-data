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
  'http://www.isolahotel.com/',
  'https://www.khotel.fr',
  'https://hotel-keystone.com',
  'https://www.kraft-hotel-paris.com/',
  'https://www.kubehotel-saint-tropez.com/',
  'https://acanthehotel.site-solocal.com/',
  'https://www.hotelacquale.com/',
];

async function runTest(client, url) {
  const domain = new URL(url).hostname.replace(/^www\./, '');
  console.log(`\n📤 Test de: ${url}`);
  try {
    const run = await client.actor(ACTOR_ID).start({
      startUrls: [{ url }],
      timeoutSecs: 60,
      usePlaywrightFallback: true,
      includeCompany: true,
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
    
    // Vérifie que address et openingHours ne sont PAS présents
    if (data?.company?.address) {
      issues.push({ severity: 'high', type: 'address_present', message: 'Le champ address ne devrait pas être présent' });
    }
    if (data?.company?.openingHours) {
      issues.push({ severity: 'high', type: 'openingHours_present', message: 'Le champ openingHours ne devrait pas être présent' });
    }
    
    // Vérifie les données essentielles
    if (!data || !data.company?.name) {
      issues.push({ severity: 'medium', type: 'missing_company_name', message: 'Nom entreprise manquant' });
    } else {
      // Vérifie que le nom n'est pas un titre générique
      const genericNames = /^(mentions\s+l[eé]gales?|privacy\s+policy|legal\s+notice|imprint|base)$/i;
      if (genericNames.test(data.company.name)) {
        issues.push({ severity: 'medium', type: 'generic_company_name', message: `Nom générique détecté: "${data.company.name}"` });
      }
    }
    if (!data?.company?.country) {
      issues.push({ severity: 'medium', type: 'missing_country', message: 'Pays manquant' });
    }
    if (data?.company?.country && !data?.company?.countryName) {
      issues.push({ severity: 'low', type: 'missing_countryName', message: 'Nom du pays manquant' });
    }
    
    // Vérifie les contacts
    if (!data?.emails || data.emails.length === 0) {
      issues.push({ severity: 'medium', type: 'missing_emails', message: 'Aucun email trouvé' });
    }
    if (!data?.phones || data.phones.length === 0) {
      issues.push({ severity: 'medium', type: 'missing_phones', message: 'Aucun téléphone trouvé' });
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

    return { url, status: 'success', data, issues };

  } catch (error) {
    return { url, status: 'error', error: error.message };
  }
}

async function main() {
  const client = new ApifyClient({ token: APIFY_TOKEN });
  const allResults = [];

  console.log('🚀 Démarrage des tests sur les nouveaux sites d\'hôtels...');
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
        console.log(`      - Company: ${result.data.company.name || 'N/A'}`);
        console.log(`      - Legal Name: ${result.data.company.legalName || 'N/A'}`);
        console.log(`      - Country: ${result.data.company.country || 'N/A'} (${result.data.company.countryName || 'N/A'})`);
        if (result.data.company.address) {
          console.log(`      - ⚠️  ADDRESS PRÉSENT (ne devrait pas l'être): ${JSON.stringify(result.data.company.address)}`);
        }
        if (result.data.company.openingHours) {
          console.log(`      - ⚠️  OPENINGHOURS PRÉSENT (ne devrait pas l'être): ${JSON.stringify(result.data.company.openingHours)}`);
        }
      } else {
        console.log('      - Company data: N/A');
      }
      console.log(`      - Emails: ${result.data?.emails?.length || 0}`);
      console.log(`      - Phones: ${result.data?.phones?.length || 0}`);
      console.log(`      - Socials: ${Object.values(result.data?.socials || {}).flat().length || 0}`);
      console.log(`      - Pages visitées: ${result.data?.pagesVisited?.length || 0}`);
    } else {
      console.log(`   ❌ Échec du test: ${result.error}`);
    }
  }

  console.log('\n================================================================================');
  console.log(`\n💾 Résultats sauvegardés dans: ${RESULTS_FILE}`);
}

main().catch(console.error);
