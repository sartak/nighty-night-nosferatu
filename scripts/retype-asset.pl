#!/usr/bin/env perl
use strict;
use warnings;
use lib 'scripts';
use Assets;

@ARGV == 2 or die "usage: $0 name newtype\n";
my ($name, $type) = @ARGV;

my $assets_file = 'src/assets/index.js';
my $assets = parse_assets($assets_file);

die "no asset named $name" if !$assets->{$name};
$type = canonicalize_asset_type($type);

$assets->{$name}{type} = $type;

emit_and_diff_assets($assets_file, $assets);
