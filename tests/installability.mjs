import {chromium} from '@playwright/test';
import {writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
const parent=path.resolve('test-results');await mkdir(parent,{recursive:true});
const profile=await mkdtemp(path.join(parent,'install-profile-'));
const context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true});
try{
 const page=await context.newPage();
 await page.goto('http://127.0.0.1:4173/travelmakeNew/');await page.locator('#nav .nav-item').first().waitFor();
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const session=await context.newCDPSession(page);await session.send('Page.enable');
 const result=await session.send('Page.getInstallabilityErrors');const manifest=await session.send('Page.getAppManifest');
 const report={browser:context.browser()?.version(),checks:result,manifestUrl:manifest.url,manifestParseErrors:manifest.errors,actualOSInstallationTested:false,isolatedPersistentProfile:true,note:'Chromium installability diagnostics in a new workspace-owned profile, not an incognito or user profile. Native OS installation and a real iPhone were not exercised.'};
 await writeFile('docs/browser-checks/installability.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 if(result.installabilityErrors?.length||manifest.errors?.length)process.exitCode=1;
}finally{await context.close();if(profile.startsWith(parent+path.sep)&&path.basename(profile).startsWith('install-profile-'))await rm(profile,{recursive:true,force:true,maxRetries:3});}
