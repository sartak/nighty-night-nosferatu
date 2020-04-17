#!/usr/bin/env perl
use strict;
use warnings;
use lib 'scripts';
use Assets;

@ARGV == 1 or die "usage: $0 name\n";
my ($name) = @ARGV;

my $assets_file = 'src/assets/index.js';
my $assets = parse_assets($assets_file);

die "no asset named $name" if !$assets->{$name};
die "$name already expanded" if $assets->{$name}{extra};

$assets->{$name}{extra} = [
  "    file: ${name},",
];

emit_and_diff_assets($assets_file, $assets);
