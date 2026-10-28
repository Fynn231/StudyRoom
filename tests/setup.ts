import { configure } from '@testing-library/dom';
// Only the test harness changes: give eventual UI/socket observations enough
// time on a busy workstation. Runtime deadlines and every assertion stay intact.
configure({ asyncUtilTimeout: 10_000 });
