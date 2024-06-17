const fs = require("fs");
const path = require("path");

const dependenciesToCheck = ["@taraswap/sdk-core", "@taraswap/v2-sdk", "@taraswap/v3-sdk"];

const getPackageJsonFiles = (dir, fileList = []) => {
  fs.readdirSync(dir).forEach((file) => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      if (file !== "node_modules") {
        // Exclude node_modules directory
        getPackageJsonFiles(filePath, fileList);
      }
    } else if (file === "package.json") {
      fileList.push(filePath);
    }
  });
  return fileList;
};

const checkDependencies = (filePaths) => {
  const versions = {};
  const errors = [];
  filePaths.forEach((filePath) => {
    const packageJson = JSON.parse(fs.readFileSync(filePath, "utf8"));
    dependenciesToCheck.forEach((dep) => {
      if (packageJson.dependencies && packageJson.dependencies[dep]) {
        if (!versions[dep]) {
          versions[dep] = packageJson.dependencies[dep];
        } else if (versions[dep] !== packageJson.dependencies[dep]) {
          const error = `Mismatch found in ${filePath} for ${dep}: ${packageJson.dependencies[dep]} (expected ${versions[dep]})`;
          errors.push(error);
        }
      }
    });
  });
  return errors;
};

const packageJsonFiles = getPackageJsonFiles("./");
const errors = checkDependencies(packageJsonFiles);

if (errors.length > 0) {
  console.error("Errors found:");
  errors.forEach((error) => console.error(error));
} else {
  console.log("No dependency mismatches found.");
}
