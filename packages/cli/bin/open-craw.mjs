#!/usr/bin/env node
import { main, processTerminal } from '../dist/index.esm.js'

process.exitCode = await main(process.argv.slice(2), processTerminal())
