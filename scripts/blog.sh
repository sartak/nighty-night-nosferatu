#!/usr/local/bin/fish
set -x DIR "$argv"

set -x PUBLIC_URL "https://sartak.org/$DIR/"

npm run build

cat build/index.html | perl -nle 'while ($_ =~ m{<script>(.*?)</script>}g) { my $s = $1; next if $s =~ /function gtag/; print $s }' > build/static/wrapper.js

rsync --delete -avz build/static/ giedi-prime:devel/sartak.org/static/$DIR/static

ls -1 build/static/css | grep -v '.map$' | perl -ple '$_ = "\@styles: /$ENV{DIR}/static/css/$_"'

echo "@scripts: /$DIR/static/wrapper.js"
ls -1 build/static/js | grep -v '^runtime' | grep -v '.map$' | perl -ple '$_ = "\@scripts: /$ENV{DIR}/static/js/$_"'
