const fs = require('fs');
const { readdir } = require('fs/promises');

class TestData {
    constructor() {
        this.files = ["none"];
        this.selectedTestFile = "none";
        this.selectedTestFileIndex = 0;
    }

    async readFiles(directoryPath) {
        const testDataDirectory = `${directoryPath}/test`;
        const testDataDirectoryExists = fs.existsSync(testDataDirectory);

        this.files = ["none"];

        if (testDataDirectoryExists) {
            this.files = await readdir(testDataDirectory);
            this.files.unshift("none");
        }
    }

    selectFile(label) {
        this.selectedTestFile = label;
        this.selectedTestFileIndex = this.files.indexOf(label);
    }

    async toggle() {
        this.selectedTestFileIndex = (this.selectedTestFileIndex + 1) % this.files.length;
        this.selectedTestFile = this.files[this.selectedTestFileIndex];
        return this.selectedTestFile;
    }

    read(directoryPath) {
        if (!this.selectedTestFile || (this.selectedTestFile === "none")) {
            return Promise.resolve({error: null, data: {}});
        }

        return fs.promises.readFile(`${directoryPath}/test/${this.selectedTestFile}`, 'utf8')
            .then(content => ({
                error: null,
                data: JSON.parse(content)
            }))
            .catch(err => ({
                error: err,
                data: null
            }));
    }
}

module.exports = TestData; 