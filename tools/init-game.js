import { fileURLToPath } from 'node:url';
import { initGame } from '../server/history.js';
try {
  const result=await initGame(fileURLToPath(new URL('..',import.meta.url)));
  console.log(result.created?'Game repository initialized with a seed commit.':'Existing game history preserved.');
} catch(error) {console.error(error.message);process.exitCode=1;}
