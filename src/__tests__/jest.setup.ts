/**
 * Jest Global Setup
 *
 * I run before every test file. I import reflect-metadata so tsyringe
 * decorators work (they need Reflect to store constructor param metadata).
 * Without this, any test that touches @injectable classes would fail.
 */
import 'reflect-metadata';
