#!/usr/bin/env perl
use strict;
use warnings;
use lib 'scripts';
use Assets;
use File::Find;
use File::Spec;

(@ARGV == 1 && $ARGV[0] eq 'auto') || @ARGV == 2 || @ARGV == 3 or die "usage: $0 name type [path]\n   or: $0 auto\n";
my ($name, $type, $path) = @ARGV;
my $auto = $name eq 'auto' && @ARGV == 1;

die "malformed name $name, expected identifier-style" unless $name =~ /^[A-Za-z_][A-Za-z_0-9]*$/;

if (!$auto) {
  $type = canonicalize_asset_type($type);
}

my $assets_file = 'src/assets/index.js';
my $assets = parse_assets($assets_file);

die "no file at $path" if $path && !-e $path;

my @new_files;
if (!$path) {
  my %seen_files = map { $_->{path} => 1 } values %$assets;
  $seen_files{"./ld-cover.png"} = 1;
  $seen_files{"./cover.png"} = 1;
  $seen_files{"./uncropped-cover.png"} = 1;

  find(sub {
      return if -d $_;
      return if /^\./;
      $File::Find::name =~ s!^src/assets/!./!;
      return if $File::Find::name =~ m{^\./public/};
      return if $seen_files{$File::Find::name};
      return unless /\.(jpg|png|wav|mp3)/;
      return if -e ".$_.ignore";
      push @new_files, $File::Find::name;
  }, 'src/assets/');
}

my @add_paths;

if ($auto) {
  for my $path (@new_files) {
    my $type;
    my $name = do {
      my $tmp = $path;
      $tmp =~ s/\.(\w+)$//;
      my $extension = $1;
      if ($extension eq 'mp3') {
        $type = 'musicAssets';
      }
      elsif ($extension eq 'wav') {
        $type = 'soundAssets';
      }
      elsif ($extension eq 'png' || $extension eq 'jpg') {
        $type = $path =~ /sprite/i ? 'spriteAssets' : 'imageAssets';
      }

      lcfirst join '', map { ucfirst lc } grep { length && $_ ne '.' } split qr![-/]!, $tmp;
    };

    die "unable to intuit name for $path" if !$name;
    die "unable to intuit type for $path" if !$type;

    push @add_paths, File::Spec->catfile('src', 'assets', $path);
    $assets->{$name} = {
      path => $path,
      type => $type,
    };
  }
}
else {
  die "already asset named $name" if $assets->{$name};

  if ($path) {
    $path =~ s!^src/assets/!./!;
  }
  else {
    my @candidates = grep { is_candidate_for_type($_, $type) } @new_files;
    die "expected exactly 1 $type candidate file under src/assets/, got " . (@candidates ? join ", ", @candidates : "none") . ". specify path as a third parameter" if @candidates != 1;
    $path = $candidates[0];
  }

  push @add_paths, File::Spec->catfile('src', 'assets', $path);
  $assets->{$name} = {
    path => $path,
    type => $type,
  };
}

emit_and_diff_assets($assets_file, $assets);
if (@add_paths) {
  system("git", "add", @add_paths);
}
