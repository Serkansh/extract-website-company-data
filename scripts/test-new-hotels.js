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
  'https://arcelonhotel.com/',
  'https://www.hotelesinstant.com/hostal-sant-pau-barcelona/',
  'https://www.hotelsantpau.com/',
  'https://apartamentsmarina.com/',
  'https://www.hotelsagradafamilia.com/',
  'https://www.hispanos7suiza.com/fr',
  'https://hostemplo.com/',
];

async function runTest(client, url) {
  const domain = new URL(url).hostname.replace(/^www\./, '');
  console.log(`\n📤 Testing: ${url}`);
  try {
    const run = await client.actor(ACTOR_ID).start({
      startUrls: [{ url }],
      timeoutSecs: 60,
      usePlaywrightFallback: true,
      includeContacts: true,
      includeSocials: true,
    });

    console.log(`   ⏳ Run started: ${run.id}`);
    const finishedRun = await client.run(run.id).waitForFinish({ waitSecs: 300 });

    if (finishedRun.status !== 'SUCCEEDED') {
      // Try to get error details from logs
      let errorDetails = `Run failed with status: ${finishedRun.status}`;
      try {
        const logStream = await client.log(run.id).get();
        const allLogs = [];
        for await (const log of logStream) {
          allLogs.push(log);
        }
        const errorLogs = allLogs.filter(log => log.level === 'ERROR' || log.level === 'EXCEPTION' || log.level === 'WARNING');
        if (errorLogs.length > 0) {
          const lastError = errorLogs[errorLogs.length - 1];
          errorDetails += ` - ${lastError.message || lastError.text || 'Unknown error'}`;
        } else if (allLogs.length > 0) {
          // Get last log entry
          const lastLog = allLogs[allLogs.length - 1];
          errorDetails += ` - Last log: ${lastLog.message || lastLog.text || 'No details'}`;
        }
      } catch (e) {
        errorDetails += ` - Could not retrieve logs: ${e.message}`;
      }
      return { url, status: 'failed', error: errorDetails };
    }

    const { items } = await client.dataset(finishedRun.defaultDatasetId).listItems();
    const data = items[0] || null;

    const issues = [];
    
    // Check that company is NOT present
    if (data?.company) {
      issues.push({ severity: 'high', type: 'company_present', message: 'Company field should not be present' });
    }
    
    // Check contacts
    if (!data?.emails || data.emails.length === 0) {
      issues.push({ severity: 'medium', type: 'missing_emails', message: 'No email found' });
    }
    if (!data?.phones || data.phones.length === 0) {
      issues.push({ severity: 'medium', type: 'missing_phones', message: 'No phone found' });
    }
    
    // Check for duplicate emails (same domain, .fr/.com variants)
    if (data?.emails) {
      const emailMap = new Map();
      for (const email of data.emails) {
        const [local, domain] = email.value.split('@');
        const key = `${local}@${domain}`;
        const variants = [`${local}@${domain.replace(/\.fr$/, '.com')}`, `${local}@${domain.replace(/\.com$/, '.fr')}`];
        for (const variant of variants) {
          if (emailMap.has(variant) && variant !== key) {
            issues.push({ severity: 'medium', type: 'duplicate_email_variant', message: `Duplicate emails detected: ${email.value} and ${emailMap.get(variant)}` });
          }
        }
        emailMap.set(key, email.value);
      }
    }
    
    // Check for false RCS/SIRET numbers
    if (data?.phones) {
      for (const phone of data.phones) {
        const digits = phone.valueRaw?.replace(/\D/g, '') || '';
        if (digits.length === 9) {
          const snippet = phone.snippet?.toLowerCase() || '';
          if (/(rcs|siret|siren|immatricul|registre|commerce|soci[eé]t[eé]s?)/i.test(snippet)) {
            issues.push({ severity: 'high', type: 'rcs_as_phone', message: `RCS number detected as phone: ${phone.valueRaw}` });
          }
        }
        // Check for GPS coordinates
        if (phone.valueRaw && /^\d+\.\d+$/.test(phone.valueRaw)) {
          const snippet = phone.snippet?.toLowerCase() || '';
          if (/(latitude|longitude|lat|lon|coord|gps|position)/i.test(snippet)) {
            issues.push({ severity: 'high', type: 'gps_as_phone', message: `GPS coordinate detected as phone: ${phone.valueRaw}` });
          }
        }
      }
    }
    
    // Check for emails with numeric prefixes
    if (data?.emails) {
      for (const email of data.emails) {
        if (/^\d+[a-z]/.test(email.value)) {
          issues.push({ severity: 'high', type: 'email_with_numeric_prefix', message: `Email with numeric prefix: ${email.value}` });
        }
      }
    }
    
    // Check for fax detected as phones
    if (data?.phones) {
      for (const phone of data.phones) {
        const snippet = phone.snippet?.toLowerCase() || '';
        if (/(fax|télécopie|facsimile)\s*[=:]\s*/i.test(snippet)) {
          issues.push({ severity: 'high', type: 'fax_as_phone', message: `Fax detected as phone: ${phone.valueRaw}` });
        }
      }
    }
    
    // Check for social policy/settings links
    if (data?.socials) {
      for (const [platform, links] of Object.entries(data.socials)) {
        for (const link of links) {
          const url = link.url?.toLowerCase() || '';
          if (/(policies|settings|help|rules|terms|privacy|legal|cookies|ads|account)/.test(url)) {
            issues.push({ severity: 'medium', type: 'social_policy_link', message: `Social settings/policy link detected: ${link.url}` });
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

  console.log('🚀 Starting tests on new hotels...');
  console.log(`📋 ${TEST_SITES.length} site(s) to test\n`);

  for (let i = 0; i < TEST_SITES.length; i++) {
    const url = TEST_SITES[i];
    console.log(`[${i + 1}/${TEST_SITES.length}]\n`);
    const result = await runTest(client, url);
    allResults.push(result);
  }

  fs.writeFileSync(RESULTS_FILE, JSON.stringify(allResults, null, 2));

  console.log('\n================================================================================');
  console.log('📊 TEST SUMMARY');
  console.log('================================================================================');

  const successful = allResults.filter(r => r.status === 'success' && r.issues.length === 0).length;
  const minorIssues = allResults.filter(r => r.status === 'success' && r.issues.length > 0).length;
  const failed = allResults.filter(r => r.status === 'failed' || r.status === 'error').length;

  console.log(`\n✅ Sites without issues: ${successful}/${TEST_SITES.length}`);
  console.log(`⚠️  Sites with issues: ${minorIssues}/${TEST_SITES.length}`);
  console.log(`❌ Failed sites: ${failed}/${TEST_SITES.length}`);

  console.log('\n--------------------------------------------------------------------------------');
  console.log('DETAILS BY SITE:');
  console.log('--------------------------------------------------------------------------------');

  for (const result of allResults) {
    const domain = new URL(result.url).hostname.replace(/^www\./, '');
    console.log(`\n🌐 ${domain}`);
    console.log(`   URL: ${result.url}`);
    if (result.status === 'success') {
      if (result.issues.length === 0) {
        console.log('   ✅ No issues detected');
      } else {
        console.log(`   ⚠️  ${result.issues.length} issue(s) detected:`);
        result.issues.forEach((issue, idx) => {
          const emoji = issue.severity === 'high' ? '🔴' : issue.severity === 'medium' ? '🟡' : '🟢';
          console.log(`      ${idx + 1}. ${emoji} [${issue.severity?.toUpperCase() || 'UNKNOWN'}] ${issue.message}`);
        });
      }
      console.log('   📋 Extracted data:');
      if (result.data?.company) {
        console.log(`      - ⚠️  COMPANY PRESENT (should not be): ${JSON.stringify(result.data.company)}`);
      }
      console.log(`      - Emails: ${result.data?.emails?.length || 0}`);
      if (result.data?.emails?.length > 0) {
        const primary = result.data.emails.find(e => e.priority === 'primary');
        console.log(`        Primary: ${primary?.value || 'N/A'}`);
        // Display all emails to check for duplicates
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
      console.log(`      - Pages visited: ${result.data?.pagesVisited?.length || 0}`);
    } else {
      console.log(`   ❌ Test failed: ${result.error}`);
    }
  }

  console.log('\n================================================================================');
  console.log(`\n💾 Results saved to: ${RESULTS_FILE}`);
}

main().catch(console.error);
