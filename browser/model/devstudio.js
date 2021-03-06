'use strict';

import path from 'path';
import fs from 'fs-extra';

import DevstudioAutoInstallGenerator from './devstudio-autoinstall';
import InstallableItem from './installable-item';
import Installer from './helpers/installer';
import Logger from '../services/logger';
import Platform from '../services/platform';

class DevstudioInstall extends InstallableItem {
  constructor(keyName, installerDataSvc, targetFolderName, downloadUrl, fileName, sha256sum, additionalLocations, additionalIus) {
    super(keyName, downloadUrl, fileName, targetFolderName, installerDataSvc, true);

    this.sha256 = sha256sum;
    this.installConfigFile = path.join(this.installerDataSvc.tempDir(), 'devstudio-autoinstall.xml');
    this.addOption('install', this.version, '', true);
    this.additionalLocations = additionalLocations;
    this.additionalIus = additionalIus;

    if (!this.useDownload) {
      this.files = {};
      this.downloaded = true;
    }
  }

  static get KEY() {
    return 'devstudio';
  }

  installAfterRequirements(progress, success, failure) {
    progress.setStatus('Installing');
    //this workaround for fuse tooling install problems
    if(fs.existsSync(this.bundledFile)) {
      this.downloadedFile = this.bundledFile;
    }
    this.InstallConfigRecord = path.join(this.installerDataSvc.devstudioDir(), 'InstallConfigRecord.xml');
    this.RenameInstallConfigRecord = path.join(this.installerDataSvc.devstudioDir(), 'InstallConfigRecord-' + this.keyName + '.xml');
    this.installGenerator = new DevstudioAutoInstallGenerator(this.installerDataSvc.devstudioDir(), this.installerDataSvc.getInstallable('jdk').getLocation(), this.version, this.additionalLocations, this.additionalIus);
    let installer = new Installer(this.keyName, progress, success, failure);
    Logger.info(this.keyName + ' - Generate devstudio auto install file content');
    let data = this.installGenerator.fileContent();
    Logger.info(this.keyName + ' - Generate devstudio auto install file content SUCCESS');

    return installer.writeFile(this.installConfigFile, data)
      .then((result) => {
        return this.headlessInstall(installer, result);
      })
      .then(() => {
        if(fs.existsSync(this.InstallConfigRecord)) {
          fs.rename(this.InstallConfigRecord, this.RenameInstallConfigRecord);
        }
        installer.succeed(true);
      })
      .catch((error) => {
        installer.fail(error);
      });
  }

  headlessInstall(installer) {
    Logger.info(this.keyName + ' - headlessInstall() called');
    let javaOpts = [
      '-DTRACE=true',
      '-jar',
      this.downloadedFile,
      this.installConfigFile
    ];
    let res = installer.execFile(
      path.join(this.installerDataSvc.getInstallable('jdk').getLocation(), 'bin', 'java'), javaOpts
    );

    return res;
  }

  isConfigurationValid() {
    let jdk = this.installerDataSvc.getInstallable('jdk');
    return jdk.isConfigured()
      && this.isConfigured()
      || this.isSkipped();
  }

  configureRuntimeDetection(name, location) {
    let runtimeproperties =  Platform.OS === 'win32'
      ? path.join(this.installerDataSvc.devstudioDir(), 'studio', 'runtime_locations.properties')
      : path.join(this.installerDataSvc.devstudioDir(), 'studio/devstudio.app/Contents/Eclipse', 'runtime_locations.properties');
    let escapedLocation = location.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
    let result = Promise.resolve();
    if(fs.existsSync(runtimeproperties)) {
      result = fs.appendFile(runtimeproperties, `\n${name}=${escapedLocation},true`).catch((error)=>{
        Logger.error(this.keyName + ' - error occured during runtime detection configuration in DevStudio');
        Logger.error(this.keyName + ` -  ${error}`);
      });
    }
    return result;
  }
}

function fromJson({keyName, installerDataSvc, targetFolderName, downloadUrl, fileName, sha256sum, additionalLocations, additionalIus}) {
  return new DevstudioInstall(keyName, installerDataSvc, targetFolderName, downloadUrl, fileName, sha256sum, additionalLocations, additionalIus);
}

DevstudioInstall.convertor = {fromJson};

export default DevstudioInstall;
