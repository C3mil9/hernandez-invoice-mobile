/** Idempotent project metadata. Does not change signing teams or signing keys. */
import { readFile, writeFile, cp, access } from 'node:fs/promises';
const exists = async path => { try { await access(path); return true; } catch { return false; } };
if (await exists('ios/App/App.xcodeproj/project.pbxproj')) {
  await cp('assets/PrivacyInfo.xcprivacy', 'ios/App/App/PrivacyInfo.xcprivacy');
  let project = await readFile('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
  if (!project.includes('PrivacyInfo.xcprivacy')) {
    project = project.replace('/* Begin PBXBuildFile section */', '/* Begin PBXBuildFile section */\n\t\tAABB00000000000000000001 /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = AABB00000000000000000002 /* PrivacyInfo.xcprivacy */; };');
    project = project.replace('/* Begin PBXFileReference section */', '/* Begin PBXFileReference section */\n\t\tAABB00000000000000000002 /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; };');
    project = project.replace('504EC3131FED79650016851F /* Info.plist */,', '504EC3131FED79650016851F /* Info.plist */,\n\t\t\t\tAABB00000000000000000002 /* PrivacyInfo.xcprivacy */,');
    project = project.replace('504EC30F1FED79650016851F /* Assets.xcassets in Resources */,', '504EC30F1FED79650016851F /* Assets.xcassets in Resources */,\n\t\t\t\tAABB00000000000000000001 /* PrivacyInfo.xcprivacy in Resources */,');
    await writeFile('ios/App/App.xcodeproj/project.pbxproj', project);
  }
}
if (await exists('android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml')) {
  await writeFile('android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml', '<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108"><path android:fillColor="#0969da" android:pathData="M0,0H108V108H0Z"/><path android:fillColor="#ffffff" android:pathData="M30,28H42V48H66V28H78V80H66V60H42V80H30Z"/></vector>\n');
}
console.log('Configured platform metadata.');
