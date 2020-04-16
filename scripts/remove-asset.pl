#!/usr/bin/env perl
use strict;
use warnings;
use lib 'scripts';
use Assets;
use File::Spec;

@ARGV == 1 or die "usage: $0 name\n";
my ($name) = @ARGV;

my $assets_file = 'src/assets/index.js';
my $assets = parse_assets($assets_file);

die "no asset named $name" if !$assets->{$name};

my $path = File::Spec->catfile('src', 'assets', $assets->{$name}{path});

delete $assets->{$name};

emit_and_diff_assets($assets_file, $assets);
system("git", "rm", $path);
