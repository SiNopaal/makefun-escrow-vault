/**
 * The Escrow Vault ($VAULT) - make.fun Bounty Entry Runner
 * 
 * Bounty: makefun-coin-promo-01
 * Target: pump.fun / Solana
 * Protocol: make.fun automated runner specification
 */

const fs = require('fs');
const path = require('path');

interface LaunchData {
  mint: string;
  create_signature: string;
}

interface OwnerData {
  wallet: string;
}

const LOG_PREFIX = '[make.fun:vault]';

function logInfo(msg: string): void {
  console.log(`${LOG_PREFIX} [INFO] ${msg}`);
}

function logSuccess(msg: string): void {
  console.log(`${LOG_PREFIX} [SUCCESS] ${msg}`);
}

function logWarn(msg: string): void {
  console.warn(`${LOG_PREFIX} [WARN] ${msg}`);
}

function logError(msg: string, err?: any): void {
  console.error(`${LOG_PREFIX} [ERROR] ${msg}`, err || '');
}

/**
 * Validates Solana Base58 public key / mint address format (32-44 base58 characters).
 */
function isValidSolanaAddress(address: string): boolean {
  if (typeof address !== 'string') return false;
  const base58Regex = /^[1-9A-HJ-NP-za-km-z]{32,44}$/;
  return base58Regex.test(address);
}

/**
 * Validates Solana transaction signature format (base58, typically 80-90 characters).
 */
function isValidSolanaSignature(signature: string): boolean {
  if (typeof signature !== 'string') return false;
  const base58Regex = /^[1-9A-HJ-NP-za-km-z]{80,90}$/;
  return base58Regex.test(signature);
}

/**
 * Resolve bot root directory with robust fallback handling.
 */
function resolveBotDirectory(): string {
  const envDir = process.env.MAKEFUN_BOT_DIR;
  if (envDir && fs.existsSync(envDir)) {
    return path.resolve(envDir);
  }
  if (envDir) {
    logWarn(`Specified MAKEFUN_BOT_DIR "${envDir}" does not exist. Falling back to cwd.`);
  }
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'LAUNCH.json'))) {
    return cwd;
  }
  if (fs.existsSync(path.join(__dirname, 'LAUNCH.json'))) {
    return __dirname;
  }
  return cwd;
}

/**
 * Resolve output directory with robust fallback handling.
 */
function resolveOutputDirectory(): string {
  const envDir = process.env.MAKEFUN_OUTPUT_DIR;
  if (envDir) {
    return path.resolve(envDir);
  }

  // Standard container output path
  const standardOutput = '/output';
  try {
    if (fs.existsSync(standardOutput)) {
      return standardOutput;
    }
    // Attempt directory creation if privileged
    fs.mkdirSync(standardOutput, { recursive: true });
    return standardOutput;
  } catch (_e) {
    logWarn(`Default "/output" not accessible/writable. Falling back to local "./output".`);
    return path.resolve(process.cwd(), 'output');
  }
}

/**
 * Validates LAUNCH.json content strictly against schema requirements.
 */
function validateLaunchMetadata(filePath: string): LaunchData {
  logInfo(`Validating launch metadata at ${filePath}...`);
  const rawContent = fs.readFileSync(filePath, 'utf-8');
  let data: any;

  try {
    data = JSON.parse(rawContent);
  } catch (err) {
    throw new Error(`Failed to parse ${filePath} as valid JSON: ${(err as Error).message}`);
  }

  if (!data || typeof data !== 'object') {
    throw new Error(`Invalid LAUNCH.json: Expected a JSON object.`);
  }

  if (!data.mint || typeof data.mint !== 'string') {
    throw new Error(`Invalid LAUNCH.json: "mint" must be a non-empty string.`);
  }

  if (!isValidSolanaAddress(data.mint)) {
    throw new Error(`Invalid LAUNCH.json: "mint" is not a valid Solana Base58 address (${data.mint}).`);
  }

  if (!data.create_signature || typeof data.create_signature !== 'string') {
    throw new Error(`Invalid LAUNCH.json: "create_signature" must be a non-empty string.`);
  }

  if (!isValidSolanaSignature(data.create_signature)) {
    throw new Error(`Invalid LAUNCH.json: "create_signature" is not a valid Solana Base58 transaction signature (${data.create_signature}).`);
  }

  logInfo(`Validated Solana Mint: ${data.mint}`);
  logInfo(`Validated Solana Tx Signature: ${data.create_signature}`);
  return data as LaunchData;
}

/**
 * Optionally checks owner.json if available.
 */
function checkOwnerMetadata(botDir: string): void {
  const ownerPath = path.resolve(botDir, '.makefun', 'owner.json');
  if (fs.existsSync(ownerPath)) {
    try {
      const ownerData: OwnerData = JSON.parse(fs.readFileSync(ownerPath, 'utf-8'));
      if (isValidSolanaAddress(ownerData.wallet)) {
        logInfo(`Verified contestant payout wallet: ${ownerData.wallet}`);
      } else {
        logWarn(`Contestant payout wallet format in ${ownerPath} seems non-standard: ${ownerData.wallet}`);
      }
    } catch (e) {
      logWarn(`Could not parse .makefun/owner.json: ${(e as Error).message}`);
    }
  }
}

/**
 * Main execution routine.
 */
function main(): void {
  try {
    logInfo('Initializing The Escrow Vault ($VAULT) automated runner...');

    const botDir = resolveBotDirectory();
    const outputDir = resolveOutputDirectory();

    logInfo(`Resolved Bot Directory: ${botDir}`);
    logInfo(`Resolved Output Directory: ${outputDir}`);

    checkOwnerMetadata(botDir);

    const sourcePath = path.resolve(botDir, 'LAUNCH.json');
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Critical: Source LAUNCH.json not found at ${sourcePath}`);
    }

    // Comprehensive Schema and Value Validation
    const launchData = validateLaunchMetadata(sourcePath);

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      logInfo(`Target output directory missing. Creating recursively: ${outputDir}`);
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const targetPath = path.resolve(outputDir, 'LAUNCH.json');

    // Atomic write / copy operation
    fs.copyFileSync(sourcePath, targetPath);

    // Verify written destination file
    if (!fs.existsSync(targetPath)) {
      throw new Error(`Post-copy verification failed: Destination file missing at ${targetPath}`);
    }

    const srcStat = fs.statSync(sourcePath);
    const destStat = fs.statSync(targetPath);

    if (srcStat.size !== destStat.size || destStat.size === 0) {
      throw new Error(`Integrity check failed: Destination file size (${destStat.size} bytes) does not match source (${srcStat.size} bytes).`);
    }

    logSuccess(`Successfully validated and deployed LAUNCH.json to ${targetPath}`);
    logSuccess(`Vault Mint: ${launchData.mint}`);
    logSuccess(`Creation Signature: ${launchData.create_signature}`);
  } catch (error) {
    logError('Execution failed encountered an unrecoverable error:', error);
    process.exit(1);
  }
}

main();
